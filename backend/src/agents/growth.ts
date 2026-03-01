import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';

export async function runGrowthTask(taskId: string, agentId: string, model: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const run = await prisma.run.create({
    data: { taskId, agentId, role: 'Growth', provider: 'anthropic', model, status: 'running' },
  });

  const startTime = Date.now();

  const logEvent = async (message: string, level = 'info') => {
    await prisma.event.create({
      data: { runId: run.id, actor: 'Growth', eventType: 'info', level, message, detailsJson: {} },
    });
  };

  // Pre-task confidence assessment
  const payload = task.payloadJson as Record<string, unknown>;
  const { score, reasons, action, evaluationId } = await assessConfidence('Growth', agentId, taskId, payload);

  if (action === 'block') {
    await logEvent(`Confidence too low (${(score * 100).toFixed(0)}%) — halting. Missing: ${reasons.join('; ')}`, 'warn');
    await prisma.approval.create({
      data: { taskId, requestedAction: `Growth confidence too low (${(score * 100).toFixed(0)}%). Needs: ${reasons.join(', ')}`, status: 'pending' },
    });
    await prisma.run.update({
      where: { id: run.id },
      data: { status: 'failed', tokenIn: 0, tokenOut: 0, costEst: 0, latencyMs: Date.now() - startTime, endedAt: new Date() },
    });
    await prisma.task.update({ where: { id: taskId }, data: { status: 'needs_approval' } });
    return { runId: run.id, halted: true, reason: `Low confidence (${(score * 100).toFixed(0)}%)`, evaluationId };
  }

  if (action === 'warn') {
    await logEvent(`Confidence warning (${(score * 100).toFixed(0)}%) — proceeding with caution. Notes: ${reasons.join('; ')}`, 'warn');
  }

  await logEvent('Analyzing market opportunity');
  await logEvent('Developing growth strategy');

  const growthPlan = {
    objective: 'Achieve product-market fit and initial growth in target segment',
    icp: {
      company_size: '10-200 employees',
      industry: 'Technology, SaaS, Professional Services',
      buyer: 'CTO, VP Engineering, or Founder',
      pain_points: ['Too much manual coordination', 'Slow execution cycles', 'Lack of system visibility'],
    },
    positioning: 'The autonomous operating system for lean, high-velocity teams',
    channels: [
      { name: 'Content marketing', priority: 'high', rationale: 'Educates market on autonomous AI potential' },
      { name: 'Developer community', priority: 'high', rationale: 'Early adopters who influence purchases' },
      { name: 'Direct outbound', priority: 'medium', rationale: 'Targeted for specific ICP accounts' },
      { name: 'Product-led growth', priority: 'medium', rationale: 'Free tier drives discovery' },
    ],
    experiments: [
      { name: 'Freemium launch', hypothesis: 'Free tier drives word-of-mouth', success_metric: '100 signups in 30 days' },
      { name: 'Technical blog series', hypothesis: 'Content drives inbound leads', success_metric: '500 organic visits/month' },
    ],
    metrics: {
      north_star: 'Weekly active directives submitted',
      leading: ['Signups', 'Activation rate', 'D7 retention'],
      lagging: ['MRR', 'NPS', 'Churn rate'],
    },
  };

  const tokenIn = 800;
  const tokenOut = 1000;
  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: growthPlan, endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'GROWTH_PLAN',
      title: 'Growth Plan',
      summary: `Growth plan targeting ${growthPlan.icp.company_size} companies. ${growthPlan.channels.length} channels, ${growthPlan.experiments.length} experiments.`,
      contentJson: growthPlan,
      visibility: 'internal',
    },
  });

  await logEvent(`Growth plan complete. Artifact: ${artifact.id}`);
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, evaluationId };
}
