import { Prisma } from '@prisma/client';
import prisma from './prisma';

export async function getSettings() {
  return prisma.settings.findUnique({ where: { id: 'global' } });
}

export async function isKillSwitchOn(): Promise<boolean> {
  const settings = await getSettings();
  return settings?.globalKillSwitch ?? false;
}

export async function getActiveRunCount(): Promise<number> {
  return prisma.run.count({ where: { status: 'running' } });
}

export async function canClaimTask(): Promise<{ allowed: boolean; reason?: string }> {
  const settings = await getSettings();
  if (!settings) return { allowed: false, reason: 'No settings found' };

  if (settings.globalKillSwitch) {
    return { allowed: false, reason: 'Global kill switch is ON' };
  }

  const activeRuns = await getActiveRunCount();
  if (activeRuns >= settings.maxParallelRuns) {
    return { allowed: false, reason: `Max parallel runs (${settings.maxParallelRuns}) reached` };
  }

  const todayTokens = await getTodayTokens();
  if (todayTokens >= settings.dailyTokenCap) {
    return { allowed: false, reason: `Daily token cap (${settings.dailyTokenCap}) reached` };
  }

  return { allowed: true };
}

export async function getTodayTokens(): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const result = await prisma.run.aggregate({
    where: { startedAt: { gte: todayStart } },
    _sum: { tokenIn: true, tokenOut: true },
  });

  return (result._sum.tokenIn ?? 0) + (result._sum.tokenOut ?? 0);
}

export async function checkPerRunTokenCap(tokenIn: number, tokenOut: number): Promise<{ allowed: boolean; reason?: string }> {
  const settings = await getSettings();
  if (!settings) return { allowed: false, reason: 'No settings found' };

  const total = tokenIn + tokenOut;
  if (total > settings.perRunTokenCap) {
    return { allowed: false, reason: `Per-run token cap (${settings.perRunTokenCap}) exceeded` };
  }

  return { allowed: true };
}

export async function checkReviewLoops(taskId: string): Promise<{ exceeded: boolean; maxLoops: number }> {
  const settings = await getSettings();
  const maxLoops = settings?.maxReviewLoops ?? 2;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  return { exceeded: (task?.loopCount ?? 0) >= maxLoops, maxLoops };
}

/**
 * Governance rule: only the CoS may create tasks for other roles.
 *
 * All agents that need to spawn downstream work must call this function
 * instead of calling prisma.task.create directly. It enforces that
 * createdByRole is always 'CoS', preventing any other role from
 * autonomously assigning work across the org without CoS authority.
 */
export async function createDownstreamTask(
  callerRole: string,
  taskData: {
    directiveId?: string | null;
    initiativeId?: string | null;
    assignedRole: string;
    assignedAgentId: string;
    status?: string;
    priority?: number;
    payloadJson: Record<string, unknown>;
  }
) {
  if (callerRole !== 'CoS') {
    throw new Error(
      `Governance violation: only CoS can create tasks for other roles (caller: ${callerRole})`
    );
  }

  return prisma.task.create({
    data: {
      directiveId: taskData.directiveId ?? null,
      initiativeId: taskData.initiativeId ?? null,
      createdByRole: 'CoS',
      assignedRole: taskData.assignedRole,
      assignedAgentId: taskData.assignedAgentId,
      status: taskData.status ?? 'queued',
      priority: taskData.priority ?? 4,
      payloadJson: taskData.payloadJson as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Governance rule: only the Conductor (human operator) may create directives.
 * Call this at the start of POST /api/directives to enforce the rule.
 */
export function assertConductorRole(role: string | undefined): void {
  if (role !== 'conductor') {
    throw Object.assign(new Error('Governance violation: only the Conductor may create directives'), {
      statusCode: 403,
    });
  }
}
