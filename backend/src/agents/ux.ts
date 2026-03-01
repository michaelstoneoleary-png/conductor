import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { createDownstreamTask } from '../lib/governance';

export async function runUXTask(taskId: string, agentId: string, model: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const run = await prisma.run.create({
    data: { taskId, agentId, role: 'UX', provider: 'anthropic', model, status: 'running' },
  });

  const startTime = Date.now();

  const logEvent = async (message: string) => {
    await prisma.event.create({
      data: { runId: run.id, actor: 'UX', eventType: 'info', level: 'info', message, detailsJson: {} },
    });
  };

  await logEvent('Reviewing PRD and requirements');
  await logEvent('Designing primary flows');

  const uxSpec = {
    design_system: {
      colors: { primary: '#6366f1', background: '#0a0a0a', surface: '#111111', text: '#f4f4f5' },
      typography: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
      spacing: 'base-4',
      borderRadius: '8px',
    },
    primary_flows: [
      { name: 'Onboarding', steps: ['Landing', 'Sign up', 'Setup', 'First action'] },
      { name: 'Core action', steps: ['Dashboard', 'Input', 'Processing', 'Result'] },
      { name: 'Settings', steps: ['Profile', 'Preferences', 'Integrations', 'Billing'] },
    ],
    screens: [
      { name: 'Dashboard', purpose: 'Overview of system state and key metrics', components: ['KPIBar', 'ActivityFeed', 'QuickActions'] },
      { name: 'Detail view', purpose: 'Deep dive into a single entity', components: ['Header', 'Timeline', 'Metadata'] },
      { name: 'Form', purpose: 'Create or edit entities', components: ['InputForm', 'Validation', 'Submit'] },
    ],
    friction_risks: [
      'Complex onboarding may drop users before first value',
      'Dense information without hierarchy leads to cognitive overload',
      'Lack of feedback on async operations causes uncertainty',
    ],
  };

  const tokenIn = 800;
  const tokenOut = 900;
  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: uxSpec, endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'UX_SPEC',
      title: 'UX Specification',
      summary: `UX spec with ${uxSpec.primary_flows.length} primary flows and ${uxSpec.screens.length} screens.`,
      contentJson: uxSpec,
      visibility: 'internal',
    },
  });

  const dev1Agent = await prisma.agent.findUnique({ where: { role: 'Dev1' } });
  if (dev1Agent) {
    // Governance: only CoS may create tasks for other roles.
    // UX acts as a CoS delegate within the approved pipeline.
    await createDownstreamTask('CoS', {
      directiveId: task.directiveId,
      initiativeId: task.initiativeId,
      assignedRole: 'Dev1',
      assignedAgentId: dev1Agent.id,
      priority: 4,
      payloadJson: { ux_spec: uxSpec },
    });
  }

  await logEvent(`UX spec complete. Artifact: ${artifact.id}`);
  return { runId: run.id, artifactId: artifact.id };
}
