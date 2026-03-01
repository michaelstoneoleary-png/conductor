import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';

const DecisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  decisionNotes: z.string().optional(),
});

export async function approvalRoutes(app: FastifyInstance) {
  app.get('/api/approvals', async (_req, reply) => {
    const approvals = await prisma.approval.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: {
        task: {
          select: { id: true, assignedRole: true, status: true, payloadJson: true, createdAt: true },
        },
      },
    });
    return reply.send({ success: true, data: approvals });
  });

  app.post('/api/approvals/:id/decision', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const body = DecisionSchema.parse(req.body);

      const approval = await prisma.approval.findUnique({ where: { id } });
      if (!approval) return reply.status(404).send({ success: false, data: null, error: 'Not found' });

      const updated = await prisma.approval.update({
        where: { id },
        data: { status: body.status, decisionNotes: body.decisionNotes, decidedAt: new Date() },
      });

      if (body.status === 'approved') {
        await prisma.task.update({
          where: { id: approval.taskId },
          data: { status: 'queued' },
        });
      } else {
        await prisma.task.update({
          where: { id: approval.taskId },
          data: { status: 'canceled' },
        });
      }

      return reply.send({ success: true, data: updated });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send({ success: false, data: null, error: err.message });
      throw err;
    }
  });
}
