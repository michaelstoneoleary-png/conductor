import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { updateAgentConfidenceAvg } from '../lib/confidence';

export async function taskRoutes(app: FastifyInstance) {
  app.get('/api/tasks', async (req, reply) => {
    const query = req.query as { status?: string; role?: string; initiativeId?: string };
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.role) where.assignedRole = query.role;
    if (query.initiativeId) where.initiativeId = query.initiativeId;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      include: { agent: { select: { name: true, role: true } } },
    });
    return reply.send({ success: true, data: tasks });
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        agent: true,
        runs: {
          orderBy: { startedAt: 'desc' },
          include: { events: { orderBy: { createdAt: 'asc' } } },
        },
        artifacts: { orderBy: { createdAt: 'desc' } },
        approvals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!task) return reply.status(404).send({ success: false, data: null, error: 'Not found' });

    const evaluations = await prisma.evaluation.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({ success: true, data: { ...task, evaluations } });
  });

  app.post('/api/tasks/claim', async (_req, reply) => {
    const task = await prisma.task.findFirst({
      where: {
        status: 'queued',
        agent: { isEnabled: true },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: { agent: true },
    });
    if (!task) return reply.send({ success: true, data: null });

    const claimed = await prisma.task.updateMany({
      where: { id: task.id, status: 'queued' },
      data: { status: 'running', startedAt: new Date() },
    });

    if (claimed.count === 0) return reply.send({ success: true, data: null });
    return reply.send({ success: true, data: task });
  });

  app.post('/api/tasks/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { actor: string; eventType: string; level?: string; message: string; detailsJson?: Record<string, unknown> };

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return reply.status(404).send({ success: false, data: null, error: 'Not found' });

    const run = await prisma.run.findFirst({ where: { taskId: id }, orderBy: { startedAt: 'desc' } });

    const event = await prisma.event.create({
      data: {
        runId: run?.id,
        actor: body.actor,
        eventType: body.eventType,
        level: body.level ?? 'info',
        message: body.message,
        detailsJson: JSON.parse(JSON.stringify(body.detailsJson ?? {})),
      },
    });

    return reply.send({ success: true, data: event });
  });

  app.post('/api/tasks/:id/complete', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { status: 'done' | 'failed'; artifactType?: string; artifactTitle?: string; artifactSummary?: string; artifactContent?: unknown };

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return reply.status(404).send({ success: false, data: null, error: 'Not found' });

    await prisma.task.update({ where: { id }, data: { status: body.status, endedAt: new Date() } });

    if (task.assignedAgentId) {
      await prisma.agent.update({
        where: { id: task.assignedAgentId },
        data: {
          status: 'idle',
          ...(body.status === 'done' ? { tasksCompleted: { increment: 1 } } : {}),
        },
      });
    }

    return reply.send({ success: true, data: { id, status: body.status } });
  });

  app.post('/api/evaluations/:id/score', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { conductorScore: number; notes?: string };

    if (!Number.isInteger(body.conductorScore) || body.conductorScore < 1 || body.conductorScore > 10) {
      return reply.status(400).send({ success: false, data: null, error: 'conductorScore must be an integer 1–10' });
    }

    const evaluation = await prisma.evaluation.findUnique({ where: { id } });
    if (!evaluation) return reply.status(404).send({ success: false, data: null, error: 'Evaluation not found' });

    const updated = await prisma.evaluation.update({
      where: { id },
      data: { conductorScore: body.conductorScore, notes: body.notes ?? null },
    });

    await updateAgentConfidenceAvg(evaluation.agentId);

    return reply.send({ success: true, data: updated });
  });
}
