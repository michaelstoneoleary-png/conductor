'use client';

import useSWR from 'swr';
import Link from 'next/link';
import api from '../../../lib/api';
import TaskTimeline from '../../../components/TaskTimeline';
import ArtifactCard from '../../../components/ArtifactCard';

const fetcher = (path: string) => api.get(path);

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
