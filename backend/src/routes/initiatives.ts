import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';

export async function initiativeRoutes(app: FastifyInstance) {
  app.get('/api/initiatives', async (_req, reply) => {
    const initiatives = await prisma.initiative.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { tasks: true, artifacts: true } },
      },
    });
    return reply.send({ success: true, data: initiatives });
  });

  app.get('/api/initiatives/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const initiative = await prisma.initiative.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { createdAt: 'desc' },
          include: { agent: { select: { name: true, role: true } } },
        },
        artifacts: { orderBy: { createdAt: 'desc' } },
        directives: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!initiative) return reply.status(404).send({ success: false, data: null, error: 'Not found' });
    return reply.send({ success: true, data: initiative });
  });
}
