import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';
import { callLLM, parseJSON, toJson } from '../lib/llm';

const SYSTEM_PROMPT = `You are a Growth & Marketing strategist AI agent at an autonomous AI company called Conductor.
Your role is to develop a concrete, actionable growth strategy based on the product or initiative described.

You must respond with a single valid JSON object (no markdown, no prose outside JSON) with these exact fields:
{
  "objective": "Clear growth objective with a measurable target",
  "icp": {
    "company_size": "e.g. 10-200 employees",
    "industry": "target industries",
    "buyer": "job title / role of economic buyer",
    "pain_points": ["pain point 1", "pain point 2"]
  },
  "positioning": "One-sentence positioning statement",
  "channels": [
    { "name": "channel name", "priority": "high" | "medium" | "low", "rationale": "why this channel" }
  ],
  "experiments": [
    { "name": "experiment name", "hypothesis": "if X then Y", "success_metric": "measurable outcome" }
  ],
  "metrics": {
    "north_star": "the single most important metric",
    "leading": ["leading indicator 1"],
    "lagging": ["lagging indicator 1"]
  },
  "go_to_market_sequence": ["step 1", "step 2", "step 3"]
}

Be specific to the actual product or initiative. Tailor ICP, channels, and experiments to what's being built.`;

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

  const contextParts: string[] = [];
  if (payload.directive) contextParts.push(`Directive:\n${payload.directive}`);
  if (payload.prd) contextParts.push(`PRD:\n${JSON.stringify(payload.prd, null, 2)}`);
  if (payload.cos_plan) contextParts.push(`CoS Plan:\n${JSON.stringify(payload.cos_plan, null, 2)}`);
  if (contextParts.length === 0) contextParts.push('Context: New product initiative requiring growth strategy');

  const userPrompt = contextParts.join('\n\n');

  await logEvent('Calling LLM to generate growth plan');
  const { content, tokenIn, tokenOut } = await callLLM(model, SYSTEM_PROMPT, userPrompt);

  interface GrowthOutput {
    objective: string;
    icp: {
      company_size: string;
      industry: string;
      buyer: string;
      pain_points: string[];
    };
    positioning: string;
    channels: Array<{ name: string; priority: 'high' | 'medium' | 'low'; rationale: string }>;
    experiments: Array<{ name: string; hypothesis: string; success_metric: string }>;
    metrics: {
      north_star: string;
      leading: string[];
      lagging: string[];
    };
    go_to_market_sequence?: string[];
  }

  const growthPlan = parseJSON<GrowthOutput>(content);

  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: toJson(growthPlan), endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'GROWTH_PLAN',
      title: 'Growth Plan',
      summary: `Growth plan targeting ${growthPlan.icp.company_size} companies. ${growthPlan.channels.length} channels, ${growthPlan.experiments.length} experiments.`,
      contentJson: toJson(growthPlan),
      visibility: 'internal',
    },
  });

  await logEvent(`Growth plan complete. Artifact: ${artifact.id}`);
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, evaluationId };
}
