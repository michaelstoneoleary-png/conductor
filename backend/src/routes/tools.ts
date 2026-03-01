import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';

const CreateToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(['research', 'code', 'communication', 'data', 'deployment']),
  configJson: z.record(z.unknown()).optional(),
});

const UpdateToolSchema = z.object({
  isEnabled: z.boolean().optional(),
  description: z.string().optional(),
  configJson: z.record(z.unknown()).optional(),
});

export async function toolRoutes(app: FastifyInstance) {
  app.get('/api/tools', async (_req, reply) => {
    const tools = await prisma.tool.findMany({ orderBy: { name: 'asc' } });
    return reply.send({ success: true, data: tools });
  });

  app.post('/api/tools', async (req, reply) => {
    try {
      const body = CreateToolSchema.parse(req.body);
      const tool = await prisma.tool.create({
        data: { ...body, configJson: JSON.parse(JSON.stringify(body.configJson ?? {})) },
      });
      return reply.status(201).send({ success: true, data: tool });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ success: false, data: null, error: err.message });
      throw err;
    }
  });

  app.patch('/api/tools/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const body = UpdateToolSchema.parse(req.body);
      const updateData: Record<string, unknown> = {};
      if (body.isEnabled !== undefined) updateData.isEnabled = body.isEnabled;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.configJson !== undefined) updateData.configJson = JSON.parse(JSON.stringify(body.configJson));
      const tool = await prisma.tool.update({ where: { id }, data: updateData as Parameters<typeof prisma.tool.update>[0]['data'] });
      return reply.send({ success: true, data: tool });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ success: false, data: null, error: err.message });
      throw err;
    }
  });
}
