import prisma from './prisma';

export const CONFIDENCE_BLOCK = 0.65;
export const CONFIDENCE_WARN = 0.80;

// Per-role warn thresholds. Block threshold is always CONFIDENCE_BLOCK.
const ROLE_WARN_THRESHOLD: Record<string, number> = {
  Research: 0.70,  // research is exploratory; some uncertainty is acceptable
  QA: 0.85,        // quality gating needs high confidence
  Dev2: 0.85,      // code review needs high confidence
};

export function getWarnThreshold(role: string): number {
  return ROLE_WARN_THRESHOLD[role] ?? CONFIDENCE_WARN;
}

export interface ConfidenceResult {
  score: number;
  reasons: string[];
  action: 'proceed' | 'warn' | 'block';
}

function scorePayload(role: string, payload: Record<string, unknown>): ConfidenceResult {
  const reasons: string[] = [];
  let score = 1.0;

  switch (role) {
    case 'CoS': {
      const transcript = payload.transcript as string | undefined;
      if (!transcript) {
        reasons.push('No directive transcript provided');
        score -= 0.4;
      } else if (transcript.length < 20) {
        reasons.push('Directive transcript is too brief to plan effectively');
        score -= 0.2;
      }
      break;
    }
    case 'PM': {
      if (!payload.directive) {
        reasons.push('No directive received from CoS');
        score -= 0.3;
      }
      if (!payload.cos_plan) {
        reasons.push('No CoS plan included — operating without strategic context');
        score -= 0.2;
      }
      break;
    }
    case 'UX': {
      if (!payload.prd) {
        reasons.push('No PRD received from PM — cannot design without requirements');
        score -= 0.35;
      }
      if (!payload.directive) {
        reasons.push('Original directive missing — business context unclear');
        score -= 0.1;
      }
      break;
    }
    case 'Dev1': {
      const uxSpec = payload.ux_spec as Record<string, unknown> | undefined;
      if (!uxSpec) {
        reasons.push('No UX spec received — cannot implement without design');
        score -= 0.4;
      } else {
        if (!uxSpec.primary_flows) {
          reasons.push('UX spec missing primary user flows');
          score -= 0.1;
        }
        if (!uxSpec.screens) {
          reasons.push('UX spec missing screen definitions');
          score -= 0.1;
        }
      }
      break;
    }
    case 'Dev2': {
      if (!payload.code_change) {
        reasons.push('No code change artifact received from Dev1');
        score -= 0.4;
      }
      if (!payload.dev1_task_id) {
        reasons.push('Dev1 task ID missing — cannot track review loop count');
        score -= 0.15;
      }
      break;
    }
    case 'QA': {
      if (!payload.review) {
        reasons.push('No code review from Dev2 — cannot assess quality gate');
        score -= 0.3;
      }
      if (!payload.code_change) {
        reasons.push('No code change artifact — nothing to test against');
        score -= 0.25;
      }
      break;
    }
    case 'Research': {
      const topic = payload.topic as string | undefined;
      if (!topic) {
        reasons.push('No research topic specified');
        score -= 0.45;
      } else if (topic.length < 10) {
        reasons.push('Research topic is too vague to produce actionable findings');
        score -= 0.2;
      }
      break;
    }
    case 'Growth': {
      // Growth agent synthesises from the task payload alone; always feasible.
      score = 0.85;
      break;
    }
    default:
      score = 0.75;
  }

  score = Math.max(0, Math.min(1, score));

  const warn = getWarnThreshold(role);
  let action: 'proceed' | 'warn' | 'block';
  if (score < CONFIDENCE_BLOCK) {
    action = 'block';
  } else if (score < warn) {
    action = 'warn';
  } else {
    action = 'proceed';
  }

  return { score, reasons, action };
}

export async function assessConfidence(
  role: string,
  agentId: string,
  taskId: string,
  payload: Record<string, unknown>
): Promise<ConfidenceResult & { evaluationId: string }> {
  const result = scorePayload(role, payload);

  const evaluation = await prisma.evaluation.create({
    data: {
      agentId,
      taskId,
      initialConfidence: result.score,
      iterationCount: 1,
    },
  });

  return { ...result, evaluationId: evaluation.id };
}

export async function markEvaluationOutcome(evaluationId: string, success: boolean): Promise<void> {
  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: { outcomeSuccess: success },
  });
}

export async function updateAgentConfidenceAvg(agentId: string): Promise<void> {
  const evals = await prisma.evaluation.findMany({
    where: { agentId },
    select: { initialConfidence: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  if (!evals.length) return;
  const avg = evals.reduce((sum, e) => sum + e.initialConfidence, 0) / evals.length;
  await prisma.agent.update({ where: { id: agentId }, data: { confidenceAvg: avg } });
}
