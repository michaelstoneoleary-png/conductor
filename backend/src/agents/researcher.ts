import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';
import { callLLM, parseJSON, toJson } from '../lib/llm';

const SYSTEM_PROMPT = `You are a Research Analyst AI agent at an autonomous AI company called Conductor.
Your role is to receive a research topic and produce actionable, well-reasoned findings.

You must respond with a single valid JSON object (no markdown, no prose outside JSON) with these exact fields:
{
  "topic": "The research topic as you understand it",
  "key_findings": ["specific finding 1", "specific finding 2"],
  "sources": [
    { "name": "source description", "reliability": "high" | "medium" | "low" }
  ],
  "confidence_level": 0.0,
  "opportunities": ["specific opportunity 1"],
  "risks": ["specific risk 1"],
  "recommendations": ["specific actionable recommendation 1"],
  "follow_up_questions": ["question that would deepen this research"]
}

confidence_level: a number between 0.0 and 1.0 representing how confident you are in these findings.
Be specific and substantive. Draw on real knowledge about the topic. Do not produce generic placeholder text.`;

export async function runResearchTask(taskId: string, agentId: string, model: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const run = await prisma.run.create({
    data: { taskId, agentId, role: 'Research', provider: 'openai', model, status: 'running' },
  });

  const startTime = Date.now();

  const logEvent = async (message: string, level = 'info') => {
    await prisma.event.create({
      data: { runId: run.id, actor: 'Research', eventType: 'info', level, message, detailsJson: {} },
    });
  };

  const payload = task.payloadJson as Record<string, unknown>;
  const { score, reasons, action, evaluationId } = await assessConfidence('Research', agentId, taskId, payload);

  if (action === 'block') {
    await logEvent(`Confidence too low (${(score * 100).toFixed(0)}%) — halting. Missing: ${reasons.join('; ')}`, 'warn');
    await prisma.approval.create({
      data: { taskId, requestedAction: `Research confidence too low (${(score * 100).toFixed(0)}%). Needs: ${reasons.join(', ')}`, status: 'pending' },
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

  const topic = (payload.topic as string) ?? 'General research topic';
  const cosPlan = payload.cos_plan ? JSON.stringify(payload.cos_plan, null, 2) : '';

  await logEvent(`Researching: ${topic.slice(0, 80)}`);
  await logEvent('Gathering and synthesizing findings');

  const userPrompt = `Research Topic:\n${topic}${cosPlan ? `\n\nStrategic Context (CoS Plan):\n${cosPlan}` : ''}`;

  await logEvent('Calling LLM to generate research report');
  const { content, tokenIn, tokenOut } = await callLLM(model, SYSTEM_PROMPT, userPrompt, 4096);

  interface ResearchOutput {
    topic: string;
    key_findings: string[];
    sources: Array<{ name: string; reliability: 'high' | 'medium' | 'low' }>;
    confidence_level: number;
    opportunities: string[];
    risks: string[];
    recommendations: string[];
    follow_up_questions?: string[];
  }

  const research = parseJSON<ResearchOutput>(content);

  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: toJson(research), endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'RESEARCH',
      title: `Research: ${topic.slice(0, 60)}`,
      summary: `Research on "${topic.slice(0, 80)}". Confidence: ${(research.confidence_level * 100).toFixed(0)}%. ${research.key_findings.length} key findings.`,
      contentJson: toJson(research),
      visibility: 'exec',
    },
  });

  await logEvent(`Research complete. Confidence: ${(research.confidence_level * 100).toFixed(0)}%. Artifact: ${artifact.id}`);
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, evaluationId };
}
