import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';

const CreateEvaluationSchema = z.object({
  agentId: z.string(),
  taskId: z.string().optional(),
  conductorScore: z.number().int().min(1).max(10).optional(),
  iterationCount: z.number().int().default(1),
  initialConfidence: z.number().min(0).max(1).default(0),
  outcomeSuccess: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function evaluationRoutes(app: FastifyInstance) {
  app.post('/api/evaluations', async (req, reply) => {
    try {
      const body = CreateEvaluationSchema.parse(req.body);

      const evaluation = await prisma.evaluation.create({ data: body });

      if (body.conductorScore !== undefined) {
        const evals = await prisma.evaluation.findMany({
          where: { agentId: body.agentId, conductorScore: { not: null } },
          select: { conductorScore: true },
        });
        const avg = evals.reduce((s, e) => s + (e.conductorScore ?? 0), 0) / evals.length;
        await prisma.agent.update({ where: { id: body.agentId }, data: { confidenceAvg: avg / 10 } });
      }

      return reply.status(201).send({ success: true, data: evaluation });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ success: false, data: null, error: err.message });
      throw err;
    }
  });
}
