import prisma from '../lib/prisma';
import { canClaimTask } from '../lib/governance';
import { runCoSTask } from '../agents/cos';
import { runPMTask } from '../agents/pm';
import { runUXTask } from '../agents/ux';
import { runDev1Task } from '../agents/dev1';
import { runDev2Task } from '../agents/dev2';
import { runQATask } from '../agents/qa';
import { runResearchTask } from '../agents/researcher';
import { runGrowthTask } from '../agents/growth';
import pino from 'pino';

const logger = pino({ name: 'worker' });

const POLL_INTERVAL_MS = 3000;

async function claimNextTask() {
  const { allowed, reason } = await canClaimTask();
  if (!allowed) {
    logger.debug({ reason }, 'Cannot claim task');
    return null;
  }

  const task = await prisma.task.findFirst({
    where: {
      status: 'queued',
      agent: { isEnabled: true },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    include: { agent: true },
  });

  if (!task) return null;

  const claimed = await prisma.task.updateMany({
    where: { id: task.id, status: 'queued' },
    data: { status: 'running', startedAt: new Date() },
  });

  if (claimed.count === 0) return null;

  return task;
}

async function executeTask(task: Awaited<ReturnType<typeof claimNextTask>>) {
  if (!task) return;

  const { id: taskId, assignedRole, assignedAgentId, agent } = task;

  if (!assignedAgentId || !agent) {
    logger.error({ taskId }, 'Task has no assigned agent');
    await prisma.task.update({ where: { id: taskId }, data: { status: 'failed', endedAt: new Date() } });
    return;
  }

  const model = agent.model;

  await prisma.agent.update({
    where: { id: assignedAgentId },
    data: { status: 'active', lastActiveAt: new Date(), tasksTotal: { increment: 1 } },
  });

  logger.info({ taskId, role: assignedRole }, 'Executing task');

  try {
    let result;

    switch (assignedRole) {
      case 'CoS':
        result = await runCoSTask(taskId, assignedAgentId, model);
        break;
      case 'PM':
        result = await runPMTask(taskId, assignedAgentId, model);
        break;
      case 'UX':
        result = await runUXTask(taskId, assignedAgentId, model);
        break;
      case 'Dev1':
        result = await runDev1Task(taskId, assignedAgentId, model);
        break;
      case 'Dev2':
        result = await runDev2Task(taskId, assignedAgentId, model);
        break;
      case 'QA':
        result = await runQATask(taskId, assignedAgentId, model);
        break;
      case 'Research':
        result = await runResearchTask(taskId, assignedAgentId, model);
        break;
      case 'Growth':
        result = await runGrowthTask(taskId, assignedAgentId, model);
        break;
      default:
        throw new Error(`Unknown role: ${assignedRole}`);
    }

    const halted = result && 'halted' in result && result.halted;

    if (!halted) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'done', endedAt: new Date() },
      });

      await prisma.agent.update({
        where: { id: assignedAgentId },
        data: { status: 'idle', tasksCompleted: { increment: 1 } },
      });
    } else {
      await prisma.agent.update({
        where: { id: assignedAgentId },
        data: { status: 'idle' },
      });
    }

    logger.info({ taskId, role: assignedRole, halted }, 'Task complete');
  } catch (err) {
    logger.error({ taskId, err }, 'Task execution failed');

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'failed', endedAt: new Date() },
    });

    await prisma.agent.update({
      where: { id: assignedAgentId },
      data: { status: 'idle' },
    });

    const existingRun = await prisma.run.findFirst({
      where: { taskId, status: 'running' },
    });

    if (existingRun) {
      await prisma.run.update({
        where: { id: existingRun.id },
        data: { status: 'failed', endedAt: new Date() },
      });
    }
  }
}

async function workerLoop() {
  try {
    const task = await claimNextTask();
    if (task) {
      await executeTask(task);
    }
  } catch (err) {
    logger.error({ err }, 'Worker loop error');
  }
}

async function main() {
  logger.info('Conductor worker starting...');

  await prisma.$connect();
  logger.info('Database connected');

  setInterval(() => {
    workerLoop().catch((err) => logger.error({ err }, 'Unhandled worker error'));
  }, POLL_INTERVAL_MS);

  logger.info(`Worker polling every ${POLL_INTERVAL_MS}ms`);
}

main().catch((err) => {
  logger.error({ err }, 'Fatal worker error');
  process.exit(1);
});
