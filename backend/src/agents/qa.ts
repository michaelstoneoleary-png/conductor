import prisma from '../lib/prisma';
import { estimateCost } from '../lib/cost';
import { assessConfidence, markEvaluationOutcome } from '../lib/confidence';
import { callLLM, parseJSON, toJson } from '../lib/llm';

const SYSTEM_PROMPT = `You are a QA Engineer AI agent at an autonomous AI company called Conductor.
Your role is to review a code change and its code review, then produce a QA report.

You must respond with a single valid JSON object (no markdown, no prose outside JSON) with these exact fields:
{
  "overall_status": "pass" | "fail" | "conditional_pass",
  "tests_run": 0,
  "tests_passed": 0,
  "tests_failed": 0,
  "critical_bugs": ["bug description — these BLOCK release"],
  "regression_risk": "low" | "medium" | "high",
  "failed_tests": [
    { "name": "test name", "severity": "minor" | "major" | "critical" }
  ],
  "coverage_assessment": "Assessment of test coverage completeness",
  "release_recommendation": "Clear recommendation on whether to release"
}

Be specific to the actual code change being reviewed. Assess the test quality mentioned in the implementation plan.
overall_status rules:
- "pass": ready to ship
- "conditional_pass": minor issues, can ship with fixes
- "fail": do not ship, critical issues present`;

export async function runQATask(taskId: string, agentId: string, model: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const run = await prisma.run.create({
    data: { taskId, agentId, role: 'QA', provider: 'openai', model, status: 'running' },
  });

  const startTime = Date.now();

  const logEvent = async (message: string, level = 'info') => {
    await prisma.event.create({
      data: { runId: run.id, actor: 'QA', eventType: 'info', level, message, detailsJson: {} },
    });
  };

  const payload = task.payloadJson as Record<string, unknown>;
  const { score, reasons, action, evaluationId } = await assessConfidence('QA', agentId, taskId, payload);

  if (action === 'block') {
    await logEvent(`Confidence too low (${(score * 100).toFixed(0)}%) — halting. Missing: ${reasons.join('; ')}`, 'warn');
    await prisma.approval.create({
      data: { taskId, requestedAction: `QA confidence too low (${(score * 100).toFixed(0)}%). Needs: ${reasons.join(', ')}`, status: 'pending' },
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

  await logEvent('Running test suite analysis');
  await logEvent('Checking regression coverage');

  const review = payload.review ? JSON.stringify(payload.review, null, 2) : 'No code review provided';
  const codeChange = payload.code_change ? JSON.stringify(payload.code_change, null, 2) : 'No code change provided';

  const userPrompt = `Code Change:\n${codeChange}\n\nCode Review:\n${review}`;

  await logEvent('Calling LLM to generate QA report');
  const { content, tokenIn, tokenOut } = await callLLM(model, SYSTEM_PROMPT, userPrompt);

  interface QAOutput {
    overall_status: 'pass' | 'fail' | 'conditional_pass';
    tests_run: number;
    tests_passed: number;
    tests_failed: number;
    critical_bugs: string[];
    regression_risk: 'low' | 'medium' | 'high';
    failed_tests: Array<{ name: string; severity: 'minor' | 'major' | 'critical' }>;
    coverage_assessment?: string;
    release_recommendation?: string;
  }

  const report = parseJSON<QAOutput>(content);

  const costEst = estimateCost(model, tokenIn, tokenOut);
  const latencyMs = Date.now() - startTime;

  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'succeeded', tokenIn, tokenOut, costEst, latencyMs, outputJson: toJson(report), endedAt: new Date() },
  });

  const artifact = await prisma.artifact.create({
    data: {
      taskId,
      runId: run.id,
      initiativeId: task.initiativeId,
      type: 'QA_REPORT',
      title: 'QA Report',
      summary: `QA ${report.overall_status}: ${report.tests_passed}/${report.tests_run} tests passed. Regression risk: ${report.regression_risk}.`,
      contentJson: toJson(report),
      visibility: 'internal',
    },
  });

  await logEvent(`QA complete. ${report.tests_passed}/${report.tests_run} passed. Artifact: ${artifact.id}`);
  await markEvaluationOutcome(evaluationId, true);
  return { runId: run.id, artifactId: artifact.id, evaluationId };
}
