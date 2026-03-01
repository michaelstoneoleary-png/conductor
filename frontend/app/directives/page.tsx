'use client';

import useSWR from 'swr';
import api from '../../lib/api';
import DirectiveForm from '../../components/DirectiveForm';
import Link from 'next/link';

const fetcher = (path: string) => api.get(path);

interface DirectiveTask {
  id: string;
  status: string;
  assignedRole: string;
}

interface Directive {
  id: string;
  transcript: string;
  inputMode: string;
  planApproved: boolean;
  createdAt: string;
  tasks: DirectiveTask[];
}

export default function DirectivesPage() {
  const { data, mutate } = useSWR<Directive[]>('/api/directives', fetcher, { refreshInterval: 5000 });

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f4f4f5', marginBottom: 4 }}>Directives</h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>Issue commands to the Chief of Staff. The CoS will plan and delegate to the team.</p>

      <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
        <DirectiveForm onSubmit={() => mutate()} />
      </div>

      <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Recent Directives</h2>

      {!data?.length ? (
        <div className="panel" style={{ padding: 16, color: '#555', fontSize: 13 }}>No directives yet. Submit one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map((d) => (
            <div key={d.id} className="panel" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, marginRight: 16 }}>
                  <div style={{ fontSize: 13, color: '#f4f4f5', marginBottom: 4, lineHeight: 1.4 }}>{d.transcript}</div>
                  <div style={{ fontSize: 11, color: '#555' }}>{new Date(d.createdAt).toLocaleString()}</div>
                </div>
              </div>
              {d.tasks.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {d.tasks.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} style={{ textDecoration: 'none' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#9ca3af', cursor: 'pointer' }}>
                        {t.assignedRole} · <span className={`badge-${t.status}`} style={{ fontSize: 10 }}>{t.status}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
