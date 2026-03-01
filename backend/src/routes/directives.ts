import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { assertConductorRole } from '../lib/governance';

const CreateDirectiveSchema = z.object({
  transcript: z.string().min(1).max(10000),
  initiativeId: z.string().optional(),
  inputMode: z.enum(['text', 'voice']).default('text'),
});

export async function directiveRoutes(app: FastifyInstance) {
  app.post('/api/directives', async (req, reply) => {
    // Governance: only the Conductor may issue directives.
    // The caller declares their role via the X-Conductor-Role header.
    const callerRole = (req.headers['x-conductor-role'] as string | undefined) ?? '';
    assertConductorRole(callerRole);

    try {
      const body = CreateDirectiveSchema.parse(req.body);

      const directive = await prisma.directive.create({
        data: {
          transcript: body.transcript,
          inputMode: body.inputMode,
          initiativeId: body.initiativeId,
        },
      });

      const cosAgent = await prisma.agent.findUnique({ where: { role: 'CoS' } });
      if (!cosAgent) {
        return reply.status(500).send({ success: false, data: null, error: 'CoS agent not found. Run seed first.' });
      }

      const task = await prisma.task.create({
        data: {
          directiveId: directive.id,
          initiativeId: body.initiativeId,
          createdByRole: 'conductor',
          assignedRole: 'CoS',
          assignedAgentId: cosAgent.id,
          status: 'queued',
          priority: 1,
          payloadJson: { transcript: body.transcript },
        },
      });

      return reply.status(201).send({ success: true, data: { directive, task } });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ success: false, data: null, error: err.message });
      }
      throw err;
    }
  });

  app.get('/api/directives', async (_req, reply) => {
    const directives = await prisma.directive.findMany({
      orderBy: { createdAt: 'desc' },
      include: { tasks: { select: { id: true, status: true, assignedRole: true } } },
    });
    return reply.send({ success: true, data: directives });
  });

  app.get('/api/directives/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const directive = await prisma.directive.findUnique({
      where: { id },
      include: {
        tasks: {
          include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
        },
      },
    });
    if (!directive) return reply.status(404).send({ success: false, data: null, error: 'Not found' });
    return reply.send({ success: true, data: directive });
  });
}
