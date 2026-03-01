'use client';

interface Event {
  id: string;
  actor: string;
  eventType: string;
  level: string;
  message: string;
  createdAt: string;
}

interface Run {
  id: string;
  role: string;
  status: string;
  tokenIn: number;
  tokenOut: number;
  costEst: number;
  latencyMs: number;
  startedAt: string;
  endedAt: string | null;
  events: Event[];
}

const levelColors: Record<string, string> = {
  info: '#6b7280',
  warn: '#f59e0b',
  error: '#ef4444',
};

export default function TaskTimeline({ runs }: { runs: Run[] }) {
  if (!runs.length) return <div style={{ color: '#666', fontSize: 13, padding: '16px 0' }}>No runs yet.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {runs.map((run) => (
        <div key={run.id} className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{run.role}</span>
              <span className={`badge badge-${run.status}`}>{run.status}</span>
            </div>
            <div style={{ fontSize: 11, color: '#666', display: 'flex', gap: 16 }}>
              <span>{run.tokenIn.toLocaleString()} in / {run.tokenOut.toLocaleString()} out</span>
              <span>${run.costEst.toFixed(5)}</span>
              <span>{run.latencyMs}ms</span>
            </div>
          </div>
          {run.events.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {run.events.map((ev) => (
                <div key={ev.id} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'baseline' }}>
                  <span style={{ color: '#555', flexShrink: 0, width: 70, textAlign: 'right' }}>
                    {new Date(ev.createdAt).toLocaleTimeString()}
                  </span>
                  <span style={{ color: levelColors[ev.level] ?? '#6b7280', flexShrink: 0, width: 60 }}>{ev.actor}</span>
                  <span style={{ color: '#d1d5db' }}>{ev.message}</span>
                </div>
              ))}
            </div>
          )}
          {!run.events.length && (
            <div style={{ fontSize: 12, color: '#555' }}>No events logged.</div>
          )}
        </div>
      ))}
    </div>
  );
}
