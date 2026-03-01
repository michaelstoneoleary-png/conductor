import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';

const UpdateAgentSchema = z.object({
  isEnabled: z.boolean().optional(),
  model: z.string().optional(),
  name: z.string().optional(),
});

const CreateAgentSchema = z.object({
  role: z.string().min(1),
  name: z.string().min(1),
  provider: z.enum(['openai', 'anthropic']),
  model: z.string().min(1),
});

export async function agentRoutes(app: FastifyInstance) {
  app.get('/api/agents', async (_req, reply) => {
    const agents = await prisma.agent.findMany({
      orderBy: { role: 'asc' },
      include: {
        _count: { select: { runs: true, tasks: true } },
      },
    });
    return reply.send({ success: true, data: agents });
  });

  app.get('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 10,
          select: { id: true, status: true, tokenIn: true, tokenOut: true, costEst: true, latencyMs: true, startedAt: true, endedAt: true },
        },
        evaluations: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!agent) return reply.status(404).send({ success: false, data: null, error: 'Not found' });
    return reply.send({ success: true, data: agent });
  });

  app.patch('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const body = UpdateAgentSchema.parse(req.body);
      const agent = await prisma.agent.update({
        where: { id },
        data: {
          ...body,
          ...(body.isEnabled === false ? { status: 'disabled' } : {}),
          ...(body.isEnabled === true ? { status: 'idle' } : {}),
        },
      });
      return reply.send({ success: true, data: agent });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ success: false, data: null, error: err.message });
      throw err;
    }
  });

  app.post('/api/agents', async (req, reply) => {
    try {
      const body = CreateAgentSchema.parse(req.body);
      const agent = await prisma.agent.create({ data: { ...body, isEnabled: true, status: 'idle' } });
      return reply.status(201).send({ success: true, data: agent });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ success: false, data: null, error: err.message });
      throw err;
    }
  });
}
