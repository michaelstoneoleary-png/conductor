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
