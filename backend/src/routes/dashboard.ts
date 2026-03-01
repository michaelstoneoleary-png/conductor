import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';

function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function get7dStart() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard/exec', async (_req, reply) => {
    const initiatives = await prisma.initiative.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { tasks: true, artifacts: true } },
      },
    });

    const pendingApprovals = await prisma.approval.findMany({
      where: { status: 'pending' },
      include: { task: { select: { id: true, assignedRole: true, status: true } } },
    });

    const promotedArtifacts = await prisma.artifact.findMany({
      where: { visibility: 'exec' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const decisionsNeeded = pendingApprovals.map((a) => ({
      approvalId: a.id,
      taskId: a.taskId,
      requestedAction: a.requestedAction,
      status: a.status,
      createdAt: a.createdAt,
    }));

    return reply.send({
      success: true,
      data: { initiatives, decisionsNeeded, promotedArtifacts },
    });
  });

  app.get('/api/dashboard/activity', async (_req, reply) => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const agents = await prisma.agent.findMany({
      include: {
        runs: {
          where: { startedAt: { gte: oneHourAgo } },
          select: { id: true, status: true, startedAt: true, tokenIn: true, tokenOut: true, costEst: true },
        },
        tasks: {
          where: { status: 'running' },
          select: { id: true, assignedRole: true, status: true },
          take: 1,
        },
      },
    });

    const artifacts = await prisma.artifact.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { task: { select: { assignedRole: true } } },
    });

    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const agentGrid = agents.map((a) => {
      const recentRuns = a.runs.length;
      let activityLevel: string;
      if (recentRuns === 0) activityLevel = 'idle';
      else if (recentRuns <= 1) activityLevel = 'light';
      else if (recentRuns <= 3) activityLevel = 'active';
      else activityLevel = 'very-active';

      const spendToday = a.runs.reduce((sum, r) => sum + (r.costEst ?? 0), 0);

      return {
        id: a.id,
        role: a.role,
        name: a.name,
        status: a.status,
        activityLevel,
        currentTaskTitle: a.tasks[0] ? `${a.tasks[0].assignedRole} task in progress` : null,
        runsToday: recentRuns,
        spendToday,
        isEnabled: a.isEnabled,
      };
    });

    return reply.send({ success: true, data: { agentGrid, artifacts, events } });
  });

  app.get('/api/dashboard/kpis', async (_req, reply) => {
    const todayStart = getTodayStart();
    const sevenDayStart = get7dStart();

    const [todayRuns, sevenDayRuns, pendingApprovals] = await Promise.all([
      prisma.run.findMany({
        where: { startedAt: { gte: todayStart } },
        select: { tokenIn: true, tokenOut: true, costEst: true, status: true },
      }),
      prisma.run.findMany({
        where: { startedAt: { gte: sevenDayStart } },
        select: { tokenIn: true, tokenOut: true, costEst: true, status: true },
      }),
      prisma.approval.count({ where: { status: 'pending' } }),
    ]);

    const tokensTodayIn = todayRuns.reduce((s, r) => s + r.tokenIn, 0);
    const tokensTodayOut = todayRuns.reduce((s, r) => s + r.tokenOut, 0);
    const costToday = todayRuns.reduce((s, r) => s + (r.costEst ?? 0), 0);
    const failuresToday = todayRuns.filter((r) => r.status === 'failed').length;

    const tokens7d = sevenDayRuns.reduce((s, r) => s + r.tokenIn + r.tokenOut, 0);
    const cost7d = sevenDayRuns.reduce((s, r) => s + (r.costEst ?? 0), 0);
    const failures7d = sevenDayRuns.filter((r) => r.status === 'failed').length;

    const systemHealth = failuresToday > 5 ? 'degraded' : 'healthy';

    return reply.send({
      success: true,
      data: {
        tokensTodayIn,
        tokensTodayOut,
        costToday,
        runsToday: todayRuns.length,
        failuresToday,
        pendingApprovals,
        systemHealth,
        last7d: {
          tokens: tokens7d,
          cost: cost7d,
          runs: sevenDayRuns.length,
          failures: failures7d,
        },
      },
    });
  });
}
