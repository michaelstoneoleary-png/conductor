'use client';

import useSWR from 'swr';
import api from '../lib/api';
import KPIBar from '../components/KPIBar';
import ControlsPanel from '../components/ControlsPanel';
import ArtifactCard from '../components/ArtifactCard';
import Link from 'next/link';

const fetcher = <T,>(path: string) => api.get<T>(path);

interface KPIs {
  tokensTodayIn: number;
  tokensTodayOut: number;
  costToday: number;
  runsToday: number;
  failuresToday: number;
  pendingApprovals: number;
  systemHealth: string;
}

interface Settings {
  globalKillSwitch: boolean;
  dailyTokenCap: number;
  perRunTokenCap: number;
  maxParallelRuns: number;
  maxReviewLoops: number;
}

interface Approval {
  id: string;
  taskId: string;
  requestedAction: string;
  status: string;
  createdAt: string;
}

interface ExecData {
  initiatives: Array<{ id: string; title: string; status: string; updatedAt: string; _count: { tasks: number; artifacts: number } }>;
  decisionsNeeded: Approval[];
  promotedArtifacts: Array<{ id: string; type: string; title: string; summary: string; contentJson: unknown; visibility: string; createdAt: string }>;
}

export default function ExecutivePage() {
  const { data: kpis, mutate: mutateKpis } = useSWR<KPIs>('/api/dashboard/kpis', fetcher, { refreshInterval: 5000 });
  const { data: settings, mutate: mutateSettings } = useSWR<Settings>('/api/settings', fetcher);
  const { data: exec, mutate: mutateExec } = useSWR<ExecData>('/api/dashboard/exec', fetcher, { refreshInterval: 5000 });

  const makeDecision = async (approvalId: string, status: 'approved' | 'rejected') => {
    await api.post(`/api/approvals/${approvalId}/decision`, { status });
    mutateExec();
    mutateKpis();
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f4f4f5', marginBottom: 4 }}>Executive Summary</h1>
        <div style={{ fontSize: 13, color: '#666' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>

      {kpis ? (
        <KPIBar {...kpis} />
      ) : (
        <div className="panel" style={{ padding: 16, marginBottom: 16, color: '#666' }}>Loading KPIs...</div>
      )}

      {settings && (
        <ControlsPanel settings={settings} onUpdate={() => { mutateSettings(); mutateKpis(); }} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Decisions Needed</h2>
          {!exec?.decisionsNeeded?.length ? (
            <div className="panel" style={{ padding: 16, color: '#555', fontSize: 13 }}>No pending decisions.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {exec.decisionsNeeded.map((a) => (
                <div key={a.id} className="panel" style={{ padding: 14 }}>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{a.requestedAction}</div>
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>Task: {a.taskId.slice(-12)}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-success" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => makeDecision(a.id, 'approved')}>Approve</button>
                    <button className="btn btn-danger" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => makeDecision(a.id, 'rejected')}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, marginTop: 20 }}>Initiatives</h2>
          {!exec?.initiatives?.length ? (
            <div className="panel" style={{ padding: 16, color: '#555', fontSize: 13 }}>No initiatives yet. Submit a directive to get started.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {exec.initiatives.map((i) => (
                <Link key={i.id} href={`/initiatives/${i.id}`} style={{ textDecoration: 'none' }}>
                  <div className="panel" style={{ padding: '10px 14px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#f4f4f5', fontWeight: 500 }}>{i.title}</span>
                      <span className={`badge badge-${i.status}`}>{i.status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
                      {i._count.tasks} tasks · {i._count.artifacts} artifacts · updated {new Date(i.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Promoted Artifacts</h2>
          {!exec?.promotedArtifacts?.length ? (
            <div className="panel" style={{ padding: 16, color: '#555', fontSize: 13 }}>No promoted artifacts yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {exec.promotedArtifacts.slice(0, 10).map((a) => (
                <ArtifactCard key={a.id} artifact={a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
