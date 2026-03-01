import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';

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

  const logEvent = async (message: string, eventType: string = 'info') => {
    await prisma.event.create({
      data: {
        runId: run.id,
        actor: 'CoS',
        eventType,
        level: 'info',
        message,
        detailsJson: {},
      },
    });
  };

  await logEvent('Analyzing directive', 'analysis');

  const transcript = task.directive?.transcript ?? (task.payloadJson as Record<string, string>)?.transcript ?? 'No directive provided';

  await logEvent('Generating plan', 'planning');

  const plan = {
    interpreted_objective: `Execute the following directive: ${transcript.slice(0, 200)}`,
    clarifying_questions: [
      'What is the target audience or end user for this work?',
      'Are there any existing constraints or systems to integrate with?',
      'What is the preferred timeline or urgency level?',
    ],
    assumptions: [
      'This is a new initiative requiring full planning and execution',
      'Standard engineering and research workflows apply',
      'Quality over speed unless otherwise specified',
    ],
    plan_steps: [
      'Research phase: gather background context and competitive landscape',
      'Planning phase: define scope, requirements, and acceptance criteria',
      'Execution phase: implement with dev team',
      'Review phase: QA and code review',
      'Delivery phase: summarize findings for Conductor',
    ],
    risks: [
      'Scope may expand without clear boundaries',
      'External data sources may be unavailable',
    ],
    decisions_needed: [
      'Confirm priority vs other active initiatives',
    ],
  };

  await logEvent('Creating downstream tasks', 'task_creation');

  const isResearch = transcript.toLowerCase().includes('research') ||
    transcript.toLowerCase().includes('analys') ||
    transcript.toLowerCase().includes('competitor') ||
    transcript.toLowerCase().includes('market');

  const downstreamTasks = [];

  if (isResearch) {
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
          payloadJson: {
            topic: transcript,
            cos_plan: plan,
          },
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
          payloadJson: {
            directive: transcript,
            cos_plan: plan,
          },
        },
      });
      downstreamTasks.push(pt.id);
    }
  }

  const tokenIn = 1200;
  const tokenOut = 800;
  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  const outputJson = { plan, downstream_tasks_created: downstreamTasks };

  await prisma.run.update({
    where: { id: run.id },
    data: {
      status: 'succeeded',
      tokenIn,
      tokenOut,
      costEst,
      latencyMs,
      outputJson,
      endedAt: new Date(),
    },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'EXEC_SUMMARY',
      title: `Executive Summary: ${transcript.slice(0, 60)}...`,
      summary: `CoS analyzed directive and created ${downstreamTasks.length} downstream task(s). Plan includes ${plan.plan_steps.length} phases.`,
      contentJson: {
        directive: transcript,
        plan,
        downstream_tasks: downstreamTasks,
        decisions_needed: plan.decisions_needed,
      },
      visibility: 'exec',
    },
  });

  if (task.directiveId) {
    await prisma.directive.update({
      where: { id: task.directiveId },
      data: { planJson: plan },
    });
  }

  await logEvent(`Plan generated. Created ${downstreamTasks.length} downstream task(s). Artifact: ${artifact.id}`, 'complete');

  return { runId: run.id, artifactId: artifact.id, downstreamTasks };
}
