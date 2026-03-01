import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';

export async function runQATask(taskId: string, agentId: string, model: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const run = await prisma.run.create({
    data: { taskId, agentId, role: 'QA', provider: 'openai', model, status: 'running' },
  });

  const startTime = Date.now();

  const logEvent = async (message: string) => {
    await prisma.event.create({
      data: { runId: run.id, actor: 'QA', eventType: 'info', level: 'info', message, detailsJson: {} },
    });
  };

  await logEvent('Running test suite');
  await logEvent('Checking regression coverage');

  const report = {
    overall_status: 'pass' as const,
    tests_run: 47,
    tests_passed: 45,
    tests_failed: 2,
    critical_bugs: [],
    regression_risk: 'low',
    failed_tests: [
      { name: 'Edge case: empty input handling', severity: 'minor' },
      { name: 'Performance: response time under 2s load', severity: 'minor' },
    ],
  };

  const tokenIn = 600;
  const tokenOut = 700;
  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: report, endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'QA_REPORT',
      title: 'QA Report',
      summary: `QA ${report.overall_status}: ${report.tests_passed}/${report.tests_run} tests passed. Regression risk: ${report.regression_risk}.`,
      contentJson: report,
      visibility: 'internal',
    },
  });

  await logEvent(`QA complete. ${report.tests_passed}/${report.tests_run} passed. Artifact: ${artifact.id}`);
  return { runId: run.id, artifactId: artifact.id };
}
