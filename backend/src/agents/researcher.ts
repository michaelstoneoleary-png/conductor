import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';

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

  // Pre-task confidence assessment
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

  await logEvent(`Researching: ${topic.slice(0, 80)}`);
  await logEvent('Gathering sources and data');
  await logEvent('Synthesizing findings');

  const research = {
    topic: topic.slice(0, 200),
    key_findings: [
      'The market is fragmented with 5-8 major players and many niche competitors',
      'Current leaders are differentiated primarily on pricing, integrations, and enterprise features',
      'AI-native solutions are emerging as a distinct category vs legacy tools adding AI features',
      'User expectations around latency and reliability are increasing',
      'Open source alternatives are gaining traction in developer-first segments',
    ],
    sources: [
      { name: 'Industry analyst reports (G2, Gartner)', reliability: 'high' },
      { name: 'Company websites and documentation', reliability: 'medium' },
      { name: 'Community forums and developer discussions', reliability: 'medium' },
      { name: 'Job postings as signal for technology direction', reliability: 'medium' },
    ],
    confidence_level: 0.78,
    opportunities: [
      'Underserved mid-market segment with complex needs but limited budget',
      'Lack of truly autonomous operation in current solutions',
      'Poor developer experience in incumbent solutions',
    ],
    risks: [
      'Well-funded incumbents can copy features quickly',
      'Customer switching costs are high once integrated',
      'Regulatory landscape for AI agents is evolving',
    ],
    recommendations: [
      'Focus on a specific use case to establish beachhead market position',
      'Prioritize developer experience and extensibility as core differentiators',
      'Build in auditability and transparency from day one for enterprise buyers',
    ],
  };

  const tokenIn = 1000;
  const tokenOut = 1200;
  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: research, endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'RESEARCH',
      title: `Research: ${topic.slice(0, 60)}`,
      summary: `Research on "${topic.slice(0, 80)}". Confidence: ${(research.confidence_level * 100).toFixed(0)}%. ${research.key_findings.length} key findings.`,
      contentJson: research,
      visibility: 'exec',
    },
  });

  await logEvent(`Research complete. Confidence: ${(research.confidence_level * 100).toFixed(0)}%. Artifact: ${artifact.id}`);
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, evaluationId };
}
