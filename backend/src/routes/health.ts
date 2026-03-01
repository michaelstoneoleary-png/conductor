import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ success: true, data: { status: 'healthy', db: 'connected', ts: new Date().toISOString() } });
    } catch {
      return reply.status(503).send({ success: false, data: null, error: 'Database unavailable' });
    }
  });
}
