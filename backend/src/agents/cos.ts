import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';
import { callLLM, parseJSON, toJson } from '../lib/llm';

const SYSTEM_PROMPT = `You are the Chief of Staff (CoS) of an autonomous AI company called Conductor.
Your role is to receive a high-level directive from the human Conductor and produce a clear, actionable execution plan.

You must respond with a single valid JSON object (no markdown, no prose outside JSON) with these exact fields:
{
  "interpreted_objective": "One sentence summary of what you understand the Conductor wants",
  "clarifying_questions": ["question1", "question2"],
  "assumptions": ["assumption1", "assumption2"],
  "plan_steps": ["step1", "step2", "step3"],
  "risks": ["risk1", "risk2"],
  "decisions_needed": ["decision1"],
  "routing": "research" | "product"
}

routing rules:
- Use "research" if the directive is primarily about analysis, market research, competitive intelligence, or information gathering.
- Use "product" if the directive is about building, designing, or launching something.

Be specific to the actual directive content — do not produce generic plans.`;

export async function runCoSTask(taskId: string, agentId: string, model: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { directive: true },
  });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const run = await prisma.run.create({
    data: {
      taskId,
      agentId,
      role: 'CoS',
      provider: 'anthropic',
      model,
      status: 'running',
    },
  });

  const startTime = Date.now();

  const logEvent = async (message: string, eventType = 'info', level = 'info') => {
    await prisma.event.create({
      data: { runId: run.id, actor: 'CoS', eventType, level, message, detailsJson: {} },
    });
  };

  const payload = task.payloadJson as Record<string, unknown>;
  const { score, reasons, action, evaluationId } = await assessConfidence('CoS', agentId, taskId, payload);

  if (action === 'block') {
    await logEvent(`Confidence too low (${(score * 100).toFixed(0)}%) — halting. Missing: ${reasons.join('; ')}`, 'confidence', 'warn');
    await prisma.approval.create({
      data: { taskId, requestedAction: `CoS confidence too low (${(score * 100).toFixed(0)}%). Needs: ${reasons.join(', ')}`, status: 'pending' },
    });
    await prisma.run.update({
      where: { id: run.id },
      data: { status: 'failed', tokenIn: 0, tokenOut: 0, costEst: 0, latencyMs: Date.now() - startTime, endedAt: new Date() },
    });
    await prisma.task.update({ where: { id: taskId }, data: { status: 'needs_approval' } });
    return { runId: run.id, halted: true, reason: `Low confidence (${(score * 100).toFixed(0)}%)`, evaluationId };
  }

  if (action === 'warn') {
    await logEvent(`Confidence warning (${(score * 100).toFixed(0)}%) — proceeding with caution. Notes: ${reasons.join('; ')}`, 'confidence', 'warn');
  }

  const transcript = task.directive?.transcript ?? (payload.transcript as string) ?? 'No directive provided';

  await logEvent('Analyzing directive', 'analysis');

  const userPrompt = `Directive from Conductor:\n\n${transcript}`;

  await logEvent('Calling LLM to generate plan', 'planning');
  const { content, tokenIn, tokenOut } = await callLLM(model, SYSTEM_PROMPT, userPrompt);

  interface CosOutput {
    interpreted_objective: string;
    clarifying_questions: string[];
    assumptions: string[];
    plan_steps: string[];
    risks: string[];
    decisions_needed: string[];
    routing?: string;
  }

  const plan = parseJSON<CosOutput>(content);
  const routing = plan.routing ?? 'product';

  await logEvent('Creating downstream tasks', 'task_creation');

  const downstreamTasks: string[] = [];

  if (routing === 'research') {
    const researchAgent = await prisma.agent.findUnique({ where: { role: 'Research' } });
    if (researchAgent) {
      const rt = await prisma.task.create({
        data: {
          directiveId: task.directiveId,
          initiativeId: task.initiativeId,
          createdByRole: 'CoS',
          assignedRole: 'Research',
          assignedAgentId: researchAgent.id,
          status: 'queued',
          priority: 4,
          payloadJson: toJson({ topic: transcript, cos_plan: plan }),
        },
      });
      downstreamTasks.push(rt.id);
    }
  } else {
    const pmAgent = await prisma.agent.findUnique({ where: { role: 'PM' } });
    if (pmAgent) {
      const pt = await prisma.task.create({
        data: {
          directiveId: task.directiveId,
          initiativeId: task.initiativeId,
          createdByRole: 'CoS',
          assignedRole: 'PM',
          assignedAgentId: pmAgent.id,
          status: 'queued',
          priority: 4,
          payloadJson: toJson({ directive: transcript, cos_plan: plan }),
        },
      });
      downstreamTasks.push(pt.id);
    }
  }

  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: toJson({ plan, downstream_tasks_created: downstreamTasks }), endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'EXEC_SUMMARY',
      title: `Executive Summary: ${transcript.slice(0, 60)}...`,
      summary: `CoS analyzed directive and created ${downstreamTasks.length} downstream task(s). Plan includes ${plan.plan_steps.length} phases.`,
      contentJson: toJson({ directive: transcript, plan, downstream_tasks: downstreamTasks, decisions_needed: plan.decisions_needed }),
      visibility: 'exec',
    },
  });

  if (task.directiveId) {
    await prisma.directive.update({ where: { id: task.directiveId }, data: { planJson: toJson(plan) } });
  }

  await logEvent(`Plan generated. Created ${downstreamTasks.length} downstream task(s). Artifact: ${artifact.id}`, 'complete');
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, downstreamTasks, evaluationId };
}
