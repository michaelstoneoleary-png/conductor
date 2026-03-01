export type AgentRole = 'CoS' | 'PM' | 'UX' | 'Dev1' | 'Dev2' | 'QA' | 'Research' | 'Growth';
export type AgentStatus = 'idle' | 'active' | 'disabled';
export type AgentProvider = 'openai' | 'anthropic';

export interface Agent {
  id: string;
  role: string;
  name: string;
  provider: string;
  model: string;
  isEnabled: boolean;
  status: string;
  lastActiveAt: string | null;
  confidenceAvg: number;
  tasksCompleted: number;
  tasksTotal: number;
  createdAt: string;
}

export type InitiativeStatus = 'not_started' | 'planning' | 'active' | 'blocked' | 'complete' | 'canceled';

export interface Initiative {
  id: string;
  title: string;
  objective: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Directive {
  id: string;
  initiativeId: string | null;
  inputMode: string;
  transcript: string;
  planJson: unknown;
  planApproved: boolean;
  createdAt: string;
}

export type TaskStatus = 'queued' | 'running' | 'needs_approval' | 'done' | 'failed' | 'canceled';

export interface Task {
  id: string;
  initiativeId: string | null;
  directiveId: string | null;
  createdByRole: string;
  assignedRole: string;
  assignedAgentId: string | null;
  status: string;
  priority: number;
  payloadJson: unknown;
  loopCount: number;
  targetEnv: string;
  requiresApproval: boolean;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface Run {
  id: string;
  taskId: string;
  agentId: string | null;
  role: string;
  provider: string;
  model: string;
  status: string;
  tokenIn: number;
  tokenOut: number;
  costEst: number;
  latencyMs: number;
  outputJson: unknown;
  startedAt: string;
  endedAt: string | null;
}

export type ArtifactType = 'PRD' | 'UX_SPEC' | 'CODE_CHANGE' | 'CODE_REVIEW' | 'QA_REPORT' | 'RESEARCH' | 'GROWTH_PLAN' | 'EXEC_SUMMARY' | 'PERSONAL_TASK' | 'COS_PLAN';

export interface Artifact {
  id: string;
  initiativeId: string | null;
  taskId: string | null;
  runId: string | null;
  type: string;
  title: string;
  summary: string;
  contentJson: unknown;
  visibility: string;
  createdAt: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
  id: string;
  taskId: string;
  requestedAction: string;
  status: string;
  decisionNotes: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface Event {
  id: string;
  runId: string | null;
  actor: string;
  eventType: string;
  level: string;
  message: string;
  detailsJson: unknown;
  createdAt: string;
}

export interface Evaluation {
  id: string;
  agentId: string;
  taskId: string | null;
  conductorScore: number | null;
  iterationCount: number;
  initialConfidence: number;
  outcomeSuccess: boolean | null;
  notes: string | null;
  createdAt: string;
}

export interface Settings {
  id: string;
  globalKillSwitch: boolean;
  dailyTokenCap: number;
  perRunTokenCap: number;
  maxParallelRuns: number;
  maxReviewLoops: number;
  updatedAt: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  isEnabled: boolean;
  configJson: unknown;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
}

export interface DashboardKPIs {
  tokensTodayIn: number;
  tokensTodayOut: number;
  costToday: number;
  runsToday: number;
  failuresToday: number;
  pendingApprovals: number;
  systemHealth: 'healthy' | 'degraded' | 'down';
  last7d: {
    tokens: number;
    cost: number;
    runs: number;
    failures: number;
  };
}
