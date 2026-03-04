import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { createDownstreamTask } from '../lib/governance';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';
import { callLLM, parseJSON, toJson } from '../lib/llm';

const SYSTEM_PROMPT = `You are a UX Designer AI agent at an autonomous AI company called Conductor.
Your role is to receive a PRD from the Product Manager and produce a clear UX specification that a developer can implement.

You must respond with a single valid JSON object (no markdown, no prose outside JSON) with these exact fields:
{
  "design_system": {
    "colors": { "primary": "#hex", "background": "#hex", "surface": "#hex", "text": "#hex", "accent": "#hex" },
    "typography": { "heading": "font name", "body": "font name", "mono": "font name" },
    "spacing": "describe spacing system e.g. base-4",
    "borderRadius": "value e.g. 8px"
  },
  "primary_flows": [
    { "name": "flow name", "steps": ["step1", "step2"] }
  ],
  "screens": [
    { "name": "screen name", "purpose": "what it does", "components": ["component1", "component2"] }
  ],
  "friction_risks": ["risk1", "risk2"],
  "accessibility_notes": ["WCAG consideration 1"]
}

Be specific to the actual product described in the PRD. Choose colors, flows, and screens that make sense for this specific product.`;

export async function runUXTask(taskId: string, agentId: string, model: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const run = await prisma.run.create({
    data: { taskId, agentId, role: 'UX', provider: 'anthropic', model, status: 'running' },
  });

  const startTime = Date.now();

  const logEvent = async (message: string, level = 'info') => {
    await prisma.event.create({
      data: { runId: run.id, actor: 'UX', eventType: 'info', level, message, detailsJson: {} },
    });
  };

  const payload = task.payloadJson as Record<string, unknown>;
  const { score, reasons, action, evaluationId } = await assessConfidence('UX', agentId, taskId, payload);

  if (action === 'block') {
    await logEvent(`Confidence too low (${(score * 100).toFixed(0)}%) — halting. Missing: ${reasons.join('; ')}`, 'warn');
    await prisma.approval.create({
      data: { taskId, requestedAction: `UX confidence too low (${(score * 100).toFixed(0)}%). Needs: ${reasons.join(', ')}`, status: 'pending' },
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

  await logEvent('Reviewing PRD and requirements');
  await logEvent('Designing primary flows');

  const prd = payload.prd ? JSON.stringify(payload.prd, null, 2) : 'No PRD provided';
  const directive = (payload.directive as string) ?? '';

  const userPrompt = `Directive:\n${directive}\n\nPRD:\n${prd}`;

  await logEvent('Calling LLM to generate UX spec');
  const { content, tokenIn, tokenOut } = await callLLM(model, SYSTEM_PROMPT, userPrompt);

  interface UXOutput {
    design_system: {
      colors: Record<string, string>;
      typography: Record<string, string>;
      spacing: string;
      borderRadius: string;
    };
    primary_flows: Array<{ name: string; steps: string[] }>;
    screens: Array<{ name: string; purpose: string; components: string[] }>;
    friction_risks: string[];
    accessibility_notes?: string[];
  }

  const uxSpec = parseJSON<UXOutput>(content);

  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: toJson(uxSpec), endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'UX_SPEC',
      title: 'UX Specification',
      summary: `UX spec with ${uxSpec.primary_flows.length} primary flows and ${uxSpec.screens.length} screens.`,
      contentJson: toJson(uxSpec),
      visibility: 'internal',
    },
  });

  const dev1Agent = await prisma.agent.findUnique({ where: { role: 'Dev1' } });
  if (dev1Agent) {
    await createDownstreamTask('CoS', {
      directiveId: task.directiveId,
      initiativeId: task.initiativeId,
      assignedRole: 'Dev1',
      assignedAgentId: dev1Agent.id,
      priority: 4,
      payloadJson: toJson({ ux_spec: uxSpec, prd: payload.prd, directive }),
    });
  }

  await logEvent(`UX spec complete. Artifact: ${artifact.id}`);
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, evaluationId };
}
