import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';

export async function runPMTask(taskId: string, agentId: string, model: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const run = await prisma.run.create({
    data: { taskId, agentId, role: 'PM', provider: 'anthropic', model, status: 'running' },
  });

  const startTime = Date.now();

  const logEvent = async (message: string) => {
    await prisma.event.create({
      data: { runId: run.id, actor: 'PM', eventType: 'info', level: 'info', message, detailsJson: {} },
    });
  };

  await logEvent('Reviewing CoS plan');
  await logEvent('Drafting PRD');
  await logEvent('Defining acceptance criteria');

  const payload = task.payloadJson as Record<string, unknown>;
  const directive = (payload.directive as string) ?? 'New product initiative';

  const prd = {
    prd_title: `PRD: ${directive.slice(0, 60)}`,
    problem: `Users need ${directive.slice(0, 100)}. Current solutions are inadequate.`,
    users: ['Power users', 'Enterprise teams', 'Individual contributors'],
    non_goals: ['Building mobile apps in v1', 'Third-party integrations beyond MVP', 'Internationalization'],
    requirements: [
      'System must handle the core use case as described in directive',
      'Performance: P95 response time < 500ms',
      'Reliability: 99.9% uptime SLA',
      'Security: All data encrypted at rest and in transit',
    ],
    acceptance_criteria: [
      'Given a user submits a request, the system processes it within 2 seconds',
      'Given an error occurs, the user sees a clear error message',
      'Given the system is under load, performance does not degrade below acceptable thresholds',
    ],
    milestones: [
      { name: 'Design complete', weeks: 1 },
      { name: 'Development complete', weeks: 3 },
      { name: 'QA complete', weeks: 4 },
      { name: 'Launch', weeks: 5 },
    ],
  };

  const tokenIn = 900;
  const tokenOut = 1100;
  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: prd, endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'PRD',
      title: prd.prd_title,
      summary: `PRD with ${prd.requirements.length} requirements and ${prd.milestones.length} milestones.`,
      contentJson: prd,
      visibility: 'internal',
    },
  });

  const uxAgent = await prisma.agent.findUnique({ where: { role: 'UX' } });
  if (uxAgent) {
    await prisma.task.create({
      data: {
        directiveId: task.directiveId,
        initiativeId: task.initiativeId,
        createdByRole: 'CoS',
        assignedRole: 'UX',
        assignedAgentId: uxAgent.id,
        status: 'queued',
        priority: 4,
        payloadJson: { prd, directive },
      },
    });
  }

  await logEvent(`PRD complete. Artifact: ${artifact.id}`);

  return { runId: run.id, artifactId: artifact.id };
}
