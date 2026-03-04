import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { checkReviewLoops, createDownstreamTask } from '../lib/governance';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';
import { callLLM, parseJSON, toJson } from '../lib/llm';

const SYSTEM_PROMPT = `You are a senior software developer specializing in code review (Dev2) at an autonomous AI company called Conductor.
Your role is to review an implementation plan produced by Dev1, assess its quality, and either approve it or request changes.

You must respond with a single valid JSON object (no markdown, no prose outside JSON) with these exact fields:
{
  "review_status": "approve" | "request_changes" | "reject",
  "critical_issues": ["issue description — these BLOCK merge"],
  "architecture_concerns": ["non-blocking concern about design or structure"],
  "security_findings": ["potential security issue to address"],
  "performance_risks": ["potential performance problem"],
  "test_coverage_gaps": ["area not adequately tested"],
  "alternative_approach_summary": "Brief description of a better approach if one exists, or 'Current approach is appropriate'",
  "review_summary": "One paragraph overall assessment"
}

review_status rules:
- "approve": implementation is solid, concerns are minor
- "request_changes": there are issues that must be fixed before merging (populate critical_issues)
- "reject": fundamental approach is wrong and must be rethought

Be specific and honest. Reference actual details from the code change.`;

export async function runDev2Task(taskId: string, agentId: string, model: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const run = await prisma.run.create({
    data: { taskId, agentId, role: 'Dev2', provider: 'anthropic', model, status: 'running' },
  });

  const startTime = Date.now();

  const logEvent = async (message: string, level = 'info') => {
    await prisma.event.create({
      data: { runId: run.id, actor: 'Dev2', eventType: 'info', level, message, detailsJson: {} },
    });
  };

  const payload = task.payloadJson as Record<string, unknown>;
  const { score, reasons, action, evaluationId } = await assessConfidence('Dev2', agentId, taskId, payload);

  if (action === 'block') {
    await logEvent(`Confidence too low (${(score * 100).toFixed(0)}%) — halting. Missing: ${reasons.join('; ')}`, 'warn');
    await prisma.approval.create({
      data: { taskId, requestedAction: `Dev2 confidence too low (${(score * 100).toFixed(0)}%). Needs: ${reasons.join(', ')}`, status: 'pending' },
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

  const dev1TaskId = payload.dev1_task_id as string | undefined;

  if (dev1TaskId) {
    const { exceeded, maxLoops } = await checkReviewLoops(dev1TaskId);
    if (exceeded) {
      await prisma.approval.create({
        data: { taskId, requestedAction: `Dev2 review loop exceeded (max ${maxLoops}). Human review required.`, status: 'pending' },
      });
      await prisma.run.update({
        where: { id: run.id },
        data: { status: 'failed', tokenIn: 0, tokenOut: 0, costEst: 0, latencyMs: Date.now() - startTime, endedAt: new Date() },
      });
      await prisma.task.update({ where: { id: taskId }, data: { status: 'needs_approval' } });
      return { runId: run.id, halted: true, reason: 'Review loop limit exceeded', evaluationId };
    }
    await prisma.task.update({ where: { id: dev1TaskId }, data: { loopCount: { increment: 1 } } });
  }

  await logEvent('Reviewing code change');
  await logEvent('Checking architecture and security');

  const codeChange = payload.code_change ? JSON.stringify(payload.code_change, null, 2) : 'No code change provided';
  const prd = payload.prd ? JSON.stringify(payload.prd, null, 2) : '';

  const userPrompt = `${prd ? `PRD context:\n${prd}\n\n` : ''}Code Change to Review:\n${codeChange}`;

  await logEvent('Calling LLM to perform code review');
  const { content, tokenIn, tokenOut } = await callLLM(model, SYSTEM_PROMPT, userPrompt);

  interface Dev2Output {
    review_status: 'approve' | 'request_changes' | 'reject';
    critical_issues: string[];
    architecture_concerns: string[];
    security_findings: string[];
    performance_risks: string[];
    test_coverage_gaps: string[];
    alternative_approach_summary: string;
    review_summary?: string;
  }

  const review = parseJSON<Dev2Output>(content);
  const reviewStatus = review.review_status;

  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: toJson(review), endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'CODE_REVIEW',
      title: 'Code Review',
      summary: `Review status: ${reviewStatus}. ${review.critical_issues.length} critical issues, ${review.architecture_concerns.length} architecture concerns.`,
      contentJson: toJson(review),
      visibility: 'internal',
    },
  });

  if (reviewStatus === 'approve' || reviewStatus === 'request_changes') {
    const qaAgent = await prisma.agent.findUnique({ where: { role: 'QA' } });
    if (qaAgent) {
      await createDownstreamTask('CoS', {
        directiveId: task.directiveId,
        initiativeId: task.initiativeId,
        assignedRole: 'QA',
        assignedAgentId: qaAgent.id,
        priority: 4,
        payloadJson: toJson({ review, code_change: payload.code_change }),
      });
    }
  }

  await logEvent(`Code review complete (${reviewStatus}). Artifact: ${artifact.id}`);
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, evaluationId };
}
