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

const CONDUCTOR_API_KEY = process.env.CONDUCTOR_API_KEY;

if (!CONDUCTOR_API_KEY) {
  logger.warn('CONDUCTOR_API_KEY is not set — all API routes are unprotected');
}

const app = Fastify({ logger: { level: 'info' } });

// Global error handler — ensures all unhandled errors return { success, data, error }
app.setErrorHandler((err, _req, reply) => {
  logger.error(err);
  const status = err.statusCode ?? 500;
  reply.status(status).send({
    success: false,
    data: null,
    error: err.message ?? 'Internal server error',
  });
});

async function start() {
  // CORS: allow configured origins, or any origin in dev (when no key is configured)
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : true;

  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // API key auth — skip health check endpoint
  app.addHook('preHandler', async (req, reply) => {
    if (req.url === '/health' || req.url === '/api/health') return;
    if (!CONDUCTOR_API_KEY) return; // unenforced if key not configured
    const provided = req.headers['x-api-key'];
    if (provided !== CONDUCTOR_API_KEY) {
      reply.status(401).send({ success: false, data: null, error: 'Unauthorized' });
    }
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
  const HOST = '0.0.0.0';

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
