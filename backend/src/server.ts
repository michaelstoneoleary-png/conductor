import Fastify from 'fastify';
import cors from '@fastify/cors';
import pino from 'pino';
import prisma from './lib/prisma';
import { healthRoutes } from './routes/health';
import { directiveRoutes } from './routes/directives';
import { dashboardRoutes } from './routes/dashboard';
import { initiativeRoutes } from './routes/initiatives';
import { taskRoutes } from './routes/tasks';
import { agentRoutes } from './routes/agents';
import { approvalRoutes } from './routes/approvals';
import { evaluationRoutes } from './routes/evaluations';
import { toolRoutes } from './routes/tools';
import { settingsRoutes } from './routes/settings';

const logger = pino({ name: 'server' });

const app = Fastify({
  logger: {
    level: 'info',
  },
});

async function start() {
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(healthRoutes);
  await app.register(directiveRoutes);
  await app.register(dashboardRoutes);
  await app.register(initiativeRoutes);
  await app.register(taskRoutes);
  await app.register(agentRoutes);
  await app.register(approvalRoutes);
  await app.register(evaluationRoutes);
  await app.register(toolRoutes);
  await app.register(settingsRoutes);

  const PORT = parseInt(process.env.PORT ?? '8080', 10);
  const HOST = 'localhost';

  try {
    await prisma.$connect();
    logger.info('Database connected');
    await app.listen({ port: PORT, host: HOST });
    logger.info(`Conductor backend running on http://${HOST}:${PORT}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();
