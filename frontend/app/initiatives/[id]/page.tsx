'use client';

import useSWR from 'swr';
import Link from 'next/link';
import api from '../../../lib/api';
import ArtifactCard from '../../../components/ArtifactCard';

const fetcher = <T,>(path: string) => api.get<T>(path);

export default function InitiativePage({ params }: { params: { id: string } }) {
  const { data } = useSWR(`/api/initiatives/${params.id}`, fetcher, { refreshInterval: 5000 });

  if (!data) return <div style={{ color: '#666', padding: 20 }}>Loading...</div>;

  const initiative = data as {
    id: string; title: string; objective: string; status: string; createdAt: string; updatedAt: string;
    tasks: Array<{ id: string; assignedRole: string; status: string; priority: number; createdAt: string; agent: { name: string } | null }>;
    artifacts: Array<{ id: string; type: string; title: string; summary: string; contentJson: unknown; visibility: string; createdAt: string }>;
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ color: '#666', fontSize: 12, textDecoration: 'none' }}>← Executive</Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f4f4f5', margin: '8px 0 4px' }}>{initiative.title}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className={`badge badge-${initiative.status}`}>{initiative.status}</span>
          <span style={{ fontSize: 12, color: '#555' }}>Updated {new Date(initiative.updatedAt).toLocaleString()}</span>
        </div>
        {initiative.objective && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#9ca3af', lineHeight: 1.6, maxWidth: 700 }}>{initiative.objective}</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Tasks ({initiative.tasks.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {initiative.tasks.map((t) => (
              <Link key={t.id} href={`/tasks/${t.id}`} style={{ textDecoration: 'none' }}>
                <div className="panel" style={{ padding: '10px 14px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ color: '#6366f1', fontSize: 12, fontWeight: 600 }}>{t.assignedRole}</span>
                      {t.agent && <span style={{ color: '#555', fontSize: 12 }}> · {t.agent.name}</span>}
                    </div>
                    <span className={`badge badge-${t.status}`}>{t.status}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Priority {t.priority} · {new Date(t.createdAt).toLocaleString()}</div>
                </div>
              </Link>
            ))}
            {!initiative.tasks.length && <div className="panel" style={{ padding: 14, color: '#555', fontSize: 13 }}>No tasks yet.</div>}
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Artifacts ({initiative.artifacts.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {initiative.artifacts.map((a) => <ArtifactCard key={a.id} artifact={a} />)}
            {!initiative.artifacts.length && <div className="panel" style={{ padding: 14, color: '#555', fontSize: 13 }}>No artifacts yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
