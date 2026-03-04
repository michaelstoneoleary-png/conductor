import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { createDownstreamTask } from '../lib/governance';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';
import { callLLM, parseJSON, toJson } from '../lib/llm';

const SYSTEM_PROMPT = `You are a senior software developer (Dev1) AI agent at an autonomous AI company called Conductor.
Your role is to receive a UX specification and PRD, then produce a detailed implementation plan for a code change.

You must respond with a single valid JSON object (no markdown, no prose outside JSON) with these exact fields:
{
  "branch_name": "feature/short-descriptive-name",
  "files_changed": ["path/to/file1.ts", "path/to/file2.tsx"],
  "implementation_summary": "Detailed explanation of the approach and key decisions made",
  "tests_written": ["description of test 1", "description of test 2"],
  "assumptions": ["assumption made during implementation"],
  "pr_description": "Full PR description suitable for code review, including what changed and why",
  "tech_decisions": ["key technical decision with rationale"]
}

Be specific — reference the actual screens, flows, and components from the UX spec. Choose realistic file paths based on the product being built.`;

export async function runDev1Task(taskId: string, agentId: string, model: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const run = await prisma.run.create({
    data: { taskId, agentId, role: 'Dev1', provider: 'openai', model, status: 'running' },
  });

  const startTime = Date.now();

  const logEvent = async (message: string, level = 'info') => {
    await prisma.event.create({
      data: { runId: run.id, actor: 'Dev1', eventType: 'info', level, message, detailsJson: {} },
    });
  };

  const payload = task.payloadJson as Record<string, unknown>;
  const { score, reasons, action, evaluationId } = await assessConfidence('Dev1', agentId, taskId, payload);

  if (action === 'block') {
    await logEvent(`Confidence too low (${(score * 100).toFixed(0)}%) — halting. Missing: ${reasons.join('; ')}`, 'warn');
    await prisma.approval.create({
      data: { taskId, requestedAction: `Dev1 confidence too low (${(score * 100).toFixed(0)}%). Needs: ${reasons.join(', ')}`, status: 'pending' },
    });
    await prisma.run.update({
      where: { id: run.id },
      data: { status: 'failed', tokenIn: 0, tokenOut: 0, costEst: 0, latencyMs: Date.now() - startTime, endedAt: new Date() },
    });
    await prisma.task.update({ where: { id: taskId }, data: { status: 'needs_approval' } });
    return { runId: run.id, halted: true, reason: `Low confidence (${(score * 100).toFixed(0)}%)`, evaluationId };
  }

  if (action === 'warn') {
    await logEvent(`Confidence warning (${(score * 100).toFixed(0)}%) — proceeding with caution. Notes: ${reasons.join('; ')}`, 'warn');
  }

  await logEvent('Reviewing UX spec and PRD');
  await logEvent('Planning implementation');

  const uxSpec = payload.ux_spec ? JSON.stringify(payload.ux_spec, null, 2) : 'No UX spec provided';
  const prd = payload.prd ? JSON.stringify(payload.prd, null, 2) : 'No PRD provided';
  const directive = (payload.directive as string) ?? '';

  const userPrompt = `Directive:\n${directive}\n\nPRD:\n${prd}\n\nUX Spec:\n${uxSpec}`;

  await logEvent('Calling LLM to plan implementation');
  const { content, tokenIn, tokenOut } = await callLLM(model, SYSTEM_PROMPT, userPrompt);

  interface Dev1Output {
    branch_name: string;
    files_changed: string[];
    implementation_summary: string;
    tests_written: string[];
    assumptions: string[];
    pr_description: string;
    tech_decisions?: string[];
  }

  const codeChange = parseJSON<Dev1Output>(content);

  if (task.targetEnv === 'prod') {
    await prisma.approval.create({
      data: { taskId, requestedAction: 'Deploy to production', status: 'pending' },
    });
    await prisma.run.update({
      where: { id: run.id },
      data: { status: 'succeeded', tokenIn, tokenOut, costEst: estimateCost(model, tokenIn, tokenOut), latencyMs: Date.now() - startTime, outputJson: toJson(codeChange), endedAt: new Date() },
    });
    await prisma.task.update({ where: { id: taskId }, data: { status: 'needs_approval' } });
    return { runId: run.id, halted: true, reason: 'Prod deployment requires approval', evaluationId };
  }

  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: toJson(codeChange), endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'CODE_CHANGE',
      title: `Code Change: ${codeChange.branch_name}`,
      summary: `Changed ${codeChange.files_changed.length} files. ${codeChange.tests_written.length} test suites written.`,
      contentJson: toJson(codeChange),
      visibility: 'internal',
    },
  });

  const dev2Agent = await prisma.agent.findUnique({ where: { role: 'Dev2' } });
  if (dev2Agent) {
    await createDownstreamTask('CoS', {
      directiveId: task.directiveId,
      initiativeId: task.initiativeId,
      assignedRole: 'Dev2',
      assignedAgentId: dev2Agent.id,
      priority: 4,
      payloadJson: toJson({ code_change: codeChange, dev1_task_id: taskId, prd: payload.prd }),
    });
  }

  await logEvent(`Code complete. Artifact: ${artifact.id}. Sent to Dev2 for review.`);
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, evaluationId };
}
