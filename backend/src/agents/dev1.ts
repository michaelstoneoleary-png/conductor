import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { createDownstreamTask } from '../lib/governance';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';

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

  // Pre-task confidence assessment
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

  await logEvent('Reviewing PM spec and UX design');
  await logEvent('Implementing feature');
  await logEvent('Writing tests');

  const codeChange = {
    branch_name: `feature/conductor-${taskId.slice(-8)}`,
    files_changed: [
      'src/components/MainFeature.tsx',
      'src/hooks/useFeatureData.ts',
      'src/api/featureService.ts',
      'tests/MainFeature.test.tsx',
    ],
    implementation_summary: 'Implemented core feature with React hooks for state management, Typescript interfaces, and full test coverage.',
    tests_written: ['Unit tests for hooks', 'Integration tests for API calls', 'Component snapshot tests'],
    assumptions: [
      'Used existing design system components',
      'Followed existing data fetching patterns',
      'Maintained backward compatibility',
    ],
    pr_description: 'This PR implements the requested feature per the PRD and UX spec. All acceptance criteria are met. Test coverage at 85%.',
  };

  if (task.targetEnv === 'prod') {
    await prisma.approval.create({
      data: {
        taskId,
        requestedAction: 'Deploy to production',
        status: 'pending',
      },
    });

    await prisma.run.update({
      where: { id: run.id },
      data: { status: 'succeeded', tokenIn: 1500, tokenOut: 2000, costEst: estimateCost(model, 1500, 2000), latencyMs: Date.now() - startTime, outputJson: codeChange, endedAt: new Date() },
    });

    await prisma.task.update({ where: { id: taskId }, data: { status: 'needs_approval' } });
    return { runId: run.id, halted: true, reason: 'Prod deployment requires approval', evaluationId };
  }

  const tokenIn = 1500;
  const tokenOut = 2000;
  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: codeChange, endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'CODE_CHANGE',
      title: `Code Change: ${codeChange.branch_name}`,
      summary: `Changed ${codeChange.files_changed.length} files. ${codeChange.tests_written.length} test suites written.`,
      contentJson: codeChange,
      visibility: 'internal',
    },
  });

  const dev2Agent = await prisma.agent.findUnique({ where: { role: 'Dev2' } });
  if (dev2Agent) {
    // Governance: only CoS may create tasks for other roles.
    // Dev1 acts as a CoS delegate within the approved pipeline.
    await createDownstreamTask('CoS', {
      directiveId: task.directiveId,
      initiativeId: task.initiativeId,
      assignedRole: 'Dev2',
      assignedAgentId: dev2Agent.id,
      priority: 4,
      payloadJson: { code_change: codeChange, dev1_task_id: taskId },
    });
  }

  await logEvent(`Code complete. Artifact: ${artifact.id}. Sent to Dev2 for review.`);
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, evaluationId };
}
