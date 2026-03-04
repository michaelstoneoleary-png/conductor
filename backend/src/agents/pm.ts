import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { createDownstreamTask } from '../lib/governance';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';
import { callLLM, parseJSON, toJson } from '../lib/llm';

const SYSTEM_PROMPT = `You are a Product Manager (PM) AI agent at an autonomous AI company called Conductor.
Your role is to receive a directive and a strategic plan from the Chief of Staff, then produce a detailed Product Requirements Document (PRD).

You must respond with a single valid JSON object (no markdown, no prose outside JSON) with these exact fields:
{
  "prd_title": "Short descriptive title",
  "problem": "Clear problem statement — why this matters, who is affected",
  "users": ["user persona 1", "user persona 2"],
  "non_goals": ["what is explicitly out of scope"],
  "requirements": ["functional/non-functional requirement 1", "requirement 2"],
  "acceptance_criteria": ["Given X, when Y, then Z — BDD style"],
  "milestones": [
    { "name": "milestone name", "weeks": 2 }
  ],
  "open_questions": ["question that needs Conductor input"]
}

Be specific to the actual directive content. Pull specifics from the CoS plan. Do not produce generic placeholder text.`;

export async function runPMTask(taskId: string, agentId: string, model: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const run = await prisma.run.create({
    data: { taskId, agentId, role: 'PM', provider: 'anthropic', model, status: 'running' },
  });

  const startTime = Date.now();

  const logEvent = async (message: string, level = 'info') => {
    await prisma.event.create({
      data: { runId: run.id, actor: 'PM', eventType: 'info', level, message, detailsJson: {} },
    });
  };

  const payload = task.payloadJson as Record<string, unknown>;
  const { score, reasons, action, evaluationId } = await assessConfidence('PM', agentId, taskId, payload);

  if (action === 'block') {
    await logEvent(`Confidence too low (${(score * 100).toFixed(0)}%) — halting. Missing: ${reasons.join('; ')}`, 'warn');
    await prisma.approval.create({
      data: { taskId, requestedAction: `PM confidence too low (${(score * 100).toFixed(0)}%). Needs: ${reasons.join(', ')}`, status: 'pending' },
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

  await logEvent('Reviewing CoS plan and directive');
  await logEvent('Drafting PRD');

  const directive = (payload.directive as string) ?? 'New product initiative';
  const cosPlan = payload.cos_plan ? JSON.stringify(payload.cos_plan, null, 2) : 'No CoS plan provided';

  const userPrompt = `Directive:\n${directive}\n\nCoS Strategic Plan:\n${cosPlan}`;

  await logEvent('Calling LLM to generate PRD');
  const { content, tokenIn, tokenOut } = await callLLM(model, SYSTEM_PROMPT, userPrompt);

  interface PRDOutput {
    prd_title: string;
    problem: string;
    users: string[];
    non_goals: string[];
    requirements: string[];
    acceptance_criteria: string[];
    milestones: Array<{ name: string; weeks: number }>;
    open_questions?: string[];
  }

  const prd = parseJSON<PRDOutput>(content);

  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: toJson(prd), endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'PRD',
      title: prd.prd_title,
      summary: `PRD with ${prd.requirements.length} requirements and ${prd.milestones.length} milestones.`,
      contentJson: toJson(prd),
      visibility: 'internal',
    },
  });

  const uxAgent = await prisma.agent.findUnique({ where: { role: 'UX' } });
  if (uxAgent) {
    await createDownstreamTask('CoS', {
      directiveId: task.directiveId,
      initiativeId: task.initiativeId,
      assignedRole: 'UX',
      assignedAgentId: uxAgent.id,
      priority: 4,
      payloadJson: toJson({ prd, directive }),
    });
  }

  await logEvent(`PRD complete. Artifact: ${artifact.id}`);
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, evaluationId };
}
