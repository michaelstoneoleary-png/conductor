'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import api from '../../../lib/api';
import TaskTimeline from '../../../components/TaskTimeline';
import ArtifactCard from '../../../components/ArtifactCard';

const fetcher = <T,>(path: string) => api.get<T>(path);

type Evaluation = {
  id: string;
  agentId: string;
  taskId: string | null;
  initialConfidence: number;
  conductorScore: number | null;
  outcomeSuccess: boolean | null;
  notes: string | null;
  iterationCount: number;
  createdAt: string;
};

function confidenceColor(score: number): string {
  if (score >= 0.80) return '#22c55e';
  if (score >= 0.65) return '#f59e0b';
  return '#ef4444';
}

function confidenceLabel(score: number): string {
  if (score >= 0.80) return 'high';
  if (score >= 0.65) return 'warn';
  return 'blocked';
}

function EvaluationPanel({ evaluation, onScore }: { evaluation: Evaluation; onScore: () => void }) {
  const [score, setScore] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleScore = async () => {
    const n = parseInt(score, 10);
    if (isNaN(n) || n < 1 || n > 10) return;
    setSubmitting(true);
    await api.post(`/api/evaluations/${evaluation.id}/score`, { conductorScore: n, notes: notes || undefined });
    setSubmitting(false);
    onScore();
  };

  const pct = (evaluation.initialConfidence * 100).toFixed(0);
  const color = confidenceColor(evaluation.initialConfidence);
  const label = confidenceLabel(evaluation.initialConfidence);

  return (
    <div className="panel" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#888' }}>Pre-task confidence</span>
          <span style={{
            fontSize: 12, fontWeight: 700, color,
            background: `${color}18`, borderRadius: 4, padding: '1px 6px',
          }}>
            {pct}% · {label}
          </span>
        </div>
        {evaluation.outcomeSuccess !== null && (
          <span style={{ fontSize: 11, color: evaluation.outcomeSuccess ? '#22c55e' : '#ef4444' }}>
            {evaluation.outcomeSuccess ? 'succeeded' : 'failed'}
          </span>
        )}
      </div>

      {evaluation.conductorScore !== null ? (
        <div style={{ fontSize: 12, color: '#666' }}>
          Conductor score: <span style={{ color: '#f4f4f5', fontWeight: 600 }}>{evaluation.conductorScore}/10</span>
          {evaluation.notes && <span style={{ marginLeft: 8, color: '#555' }}>{evaluation.notes}</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <input
            type="number"
            min={1}
            max={10}
            placeholder="1–10"
            value={score}
            onChange={e => setScore(e.target.value)}
            style={{
              width: 52, padding: '3px 6px', fontSize: 12, background: '#1a1a1a',
              border: '1px solid #2a2a2a', borderRadius: 4, color: '#f4f4f5',
            }}
          />
          <input
            type="text"
            placeholder="Optional notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{
              flex: 1, padding: '3px 6px', fontSize: 12, background: '#1a1a1a',
              border: '1px solid #2a2a2a', borderRadius: 4, color: '#f4f4f5',
            }}
          />
          <button
            className="btn"
            disabled={submitting || !score}
            onClick={handleScore}
            style={{ fontSize: 11, padding: '3px 10px' }}
          >
            Score
          </button>
        </div>
      )}
    </div>
  );
}

export default function TaskPage({ params }: { params: { id: string } }) {
  const { data, mutate } = useSWR(`/api/tasks/${params.id}`, fetcher, { refreshInterval: 3000 });

  const makeDecision = async (approvalId: string, status: 'approved' | 'rejected') => {
    await api.post(`/api/approvals/${approvalId}/decision`, { status });
    mutate();
  };

  if (!data) return <div style={{ color: '#666', padding: 20 }}>Loading...</div>;

  const task = data as {
    id: string; assignedRole: string; status: string; priority: number; targetEnv: string;
    payloadJson: unknown; loopCount: number; requiresApproval: boolean;
    createdAt: string; startedAt: string | null; endedAt: string | null;
    agent: { name: string; role: string } | null;
    runs: Array<{ id: string; role: string; status: string; tokenIn: number; tokenOut: number; costEst: number; latencyMs: number; startedAt: string; endedAt: string | null; events: Array<{ id: string; actor: string; eventType: string; level: string; message: string; createdAt: string }> }>;
    artifacts: Array<{ id: string; type: string; title: string; summary: string; contentJson: unknown; visibility: string; createdAt: string }>;
    approvals: Array<{ id: string; requestedAction: string; status: string; createdAt: string }>;
    evaluations: Evaluation[];
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link href="/directives" style={{ color: '#666', fontSize: 12, textDecoration: 'none' }}>← Directives</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#f4f4f5', marginBottom: 4 }}>
              Task: {task.assignedRole}
              {task.agent && <span style={{ fontSize: 14, fontWeight: 400, color: '#666', marginLeft: 8 }}>({task.agent.name})</span>}
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className={`badge badge-${task.status}`}>{task.status}</span>
              <span style={{ fontSize: 11, color: '#555' }}>Priority {task.priority}</span>
              <span style={{ fontSize: 11, color: '#555' }}>Env: {task.targetEnv}</span>
              <span style={{ fontSize: 11, color: '#555' }}>Loop #{task.loopCount}</span>
            </div>
          </div>
        </div>
      </div>

      {task.approvals.filter(a => a.status === 'pending').map(a => (
        <div key={a.id} className="panel" style={{ padding: 16, marginBottom: 16, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 600, marginBottom: 6 }}>Approval Required</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>{a.requestedAction}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" onClick={() => makeDecision(a.id, 'approved')}>Approve</button>
            <button className="btn btn-danger" onClick={() => makeDecision(a.id, 'rejected')}>Reject</button>
          </div>
        </div>
      ))}

      {task.evaluations?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Confidence & Scoring
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {task.evaluations.map(ev => (
              <EvaluationPanel key={ev.id} evaluation={ev} onScore={mutate} />
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Run Timeline</h2>
          <TaskTimeline runs={task.runs} />
        </div>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Artifacts</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {task.artifacts.map((a) => <ArtifactCard key={a.id} artifact={a} />)}
            {!task.artifacts.length && <div className="panel" style={{ padding: 14, color: '#555', fontSize: 13 }}>No artifacts yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
