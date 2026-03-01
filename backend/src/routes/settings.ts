import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';

const UpdateSettingsSchema = z.object({
  globalKillSwitch: z.boolean().optional(),
  dailyTokenCap: z.number().int().min(1000).optional(),
  perRunTokenCap: z.number().int().min(100).optional(),
  maxParallelRuns: z.number().int().min(1).max(20).optional(),
  maxReviewLoops: z.number().int().min(1).max(10).optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async (_req, reply) => {
    const settings = await prisma.settings.findUnique({ where: { id: 'global' } });
    if (!settings) return reply.status(404).send({ success: false, data: null, error: 'Settings not found. Run seed.' });
    return reply.send({ success: true, data: settings });
  });

  app.patch('/api/settings', async (req, reply) => {
    try {
      const body = UpdateSettingsSchema.parse(req.body);
      const settings = await prisma.settings.update({
        where: { id: 'global' },
        data: body,
      });
      return reply.send({ success: true, data: settings });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ success: false, data: null, error: err.message });
      throw err;
    }
  });
}
