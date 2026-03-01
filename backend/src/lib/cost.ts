const MODEL_COSTS: Record<string, { in: number; out: number }> = {
  'claude-opus-4-6': { in: 0.000015, out: 0.000075 },
  'claude-sonnet-4-6': { in: 0.000003, out: 0.000015 },
  'gpt-4o': { in: 0.0000025, out: 0.00001 },
  'gpt-4o-mini': { in: 0.00000015, out: 0.0000006 },
};

export function estimateCost(model: string, tokenIn: number, tokenOut: number): number {
  const rates = MODEL_COSTS[model] ?? { in: 0.000003, out: 0.000015 };
  return rates.in * tokenIn + rates.out * tokenOut;
}
