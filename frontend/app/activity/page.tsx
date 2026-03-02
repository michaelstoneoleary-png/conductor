'use client';

import useSWR from 'swr';
import api from '../../lib/api';
import AgentGrid from '../../components/AgentGrid';
import ArtifactCard from '../../components/ArtifactCard';

const fetcher = <T,>(path: string) => api.get<T>(path);

interface ActivityData {
  agentGrid: Array<{
    id: string; role: string; name: string; status: string;
    activityLevel: string; currentTaskTitle: string | null;
    runsToday: number; spendToday: number; isEnabled: boolean;
  }>;
  artifacts: Array<{ id: string; type: string; title: string; summary: string; contentJson: unknown; visibility: string; createdAt: string }>;
  events: Array<{ id: string; actor: string; eventType: string; level: string; message: string; createdAt: string }>;
}

const levelColors: Record<string, string> = { info: '#6b7280', warn: '#f59e0b', error: '#ef4444' };

export default function ActivityPage() {
  const { data } = useSWR<ActivityData>('/api/dashboard/activity', fetcher, { refreshInterval: 3000 });

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f4f4f5', marginBottom: 20 }}>Office Activity</h1>

      <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Agent Grid</h2>
      {data ? (
        <AgentGrid agents={data.agentGrid} />
      ) : (
        <div className="panel" style={{ padding: 16, color: '#666' }}>Loading agents...</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 24 }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Work Product Feed</h2>
          {!data?.artifacts?.length ? (
            <div className="panel" style={{ padding: 16, color: '#555', fontSize: 13 }}>No artifacts yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.artifacts.map((a) => <ArtifactCard key={a.id} artifact={a} />)}
            </div>
          )}
        </div>

        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Event Log</h2>
          <div className="panel" style={{ padding: 12 }}>
            {!data?.events?.length ? (
              <div style={{ color: '#555', fontSize: 13, padding: '4px 0' }}>No events yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 600, overflowY: 'auto' }}>
                {data.events.map((ev) => (
                  <div key={ev.id} style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'baseline' }}>
                    <span style={{ color: '#555', flexShrink: 0, width: 65 }}>{new Date(ev.createdAt).toLocaleTimeString()}</span>
                    <span style={{ color: levelColors[ev.level] ?? '#6b7280', flexShrink: 0, width: 70, fontWeight: 500 }}>{ev.actor}</span>
                    <span style={{ color: '#9ca3af' }}>{ev.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
