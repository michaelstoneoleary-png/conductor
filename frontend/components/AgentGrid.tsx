'use client';

interface AgentCard {
  id: string;
  role: string;
  name: string;
  status: string;
  activityLevel: string;
  currentTaskTitle: string | null;
  runsToday: number;
  spendToday: number;
  isEnabled: boolean;
}

const activityColors: Record<string, string> = {
  idle: '#374151',
  light: '#1e3a5f',
  active: '#065f46',
  'very-active': '#14532d',
};

export default function AgentGrid({ agents }: { agents: AgentCard[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
      {agents.map((a) => (
        <div
          key={a.id}
          className="card"
          style={{ padding: '14px', opacity: a.isEnabled ? 1 : 0.5 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{a.role}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', marginTop: 2 }}>{a.name}</div>
            </div>
            <span className={`badge badge-${a.status}`}>{a.status}</span>
          </div>
          {a.currentTaskTitle && (
            <div style={{ fontSize: 11, color: '#6366f1', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.currentTaskTitle}
            </div>
          )}
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: activityColors[a.activityLevel] ?? activityColors.idle,
              marginBottom: 8,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666' }}>
            <span>{a.runsToday} runs</span>
            <span>${a.spendToday.toFixed(4)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
