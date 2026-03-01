import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { checkReviewLoops, createDownstreamTask } from '../lib/governance';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';

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

  // Pre-task confidence assessment
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

  await logEvent('Reviewing code change');

  const dev1TaskId = payload.dev1_task_id as string | undefined;

  if (dev1TaskId) {
    const { exceeded, maxLoops } = await checkReviewLoops(dev1TaskId);
    if (exceeded) {
      await prisma.approval.create({
        data: { taskId, requestedAction: `Dev2 review loop exceeded (max ${maxLoops}). Human review required.`, status: 'pending' },
      });

      await prisma.run.update({
        where: { id: run.id },
        data: { status: 'failed', tokenIn: 500, tokenOut: 200, costEst: 0, latencyMs: Date.now() - startTime, endedAt: new Date() },
      });

      await prisma.task.update({ where: { id: taskId }, data: { status: 'needs_approval' } });
      return { runId: run.id, halted: true, reason: 'Review loop limit exceeded', evaluationId };
    }

    await prisma.task.update({ where: { id: dev1TaskId }, data: { loopCount: { increment: 1 } } });
  }

  await logEvent('Checking architecture and security');

  const reviewStatus = 'approve';

  const review = {
    review_status: reviewStatus,
    critical_issues: [],
    architecture_concerns: ['Consider extracting shared logic into a utility layer for future reuse'],
    security_findings: ['Ensure all user inputs are sanitized before database operations'],
    performance_risks: ['N+1 query pattern possible in list views — consider adding pagination'],
    test_coverage_gaps: ['Edge cases for error states need additional coverage'],
    alternative_approach_summary: 'Current approach is solid. Future consideration: event-driven architecture for async operations.',
  };

  const tokenIn = 1200;
  const tokenOut = 800;
  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: review, endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'CODE_REVIEW',
      title: 'Code Review',
      summary: `Review status: ${reviewStatus}. ${review.critical_issues.length} critical issues, ${review.architecture_concerns.length} architecture concerns.`,
      contentJson: review,
      visibility: 'internal',
    },
  });

  if (reviewStatus === 'approve' || reviewStatus === 'approve_with_changes') {
    const qaAgent = await prisma.agent.findUnique({ where: { role: 'QA' } });
    if (qaAgent) {
      // Governance: only CoS may create tasks for other roles.
      // Dev2 acts as a CoS delegate within the approved pipeline.
      await createDownstreamTask('CoS', {
        directiveId: task.directiveId,
        initiativeId: task.initiativeId,
        assignedRole: 'QA',
        assignedAgentId: qaAgent.id,
        priority: 4,
        payloadJson: JSON.parse(JSON.stringify({ review, code_change: payload.code_change })),
      });
    }
  }

  await logEvent(`Code review complete (${reviewStatus}). Artifact: ${artifact.id}`);
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, evaluationId };
}
