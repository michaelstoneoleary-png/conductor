'use client';

interface KPIBarProps {
  tokensTodayIn: number;
  tokensTodayOut: number;
  costToday: number;
  runsToday: number;
  failuresToday: number;
  pendingApprovals: number;
  systemHealth: string;
}

export default function KPIBar({ tokensTodayIn, tokensTodayOut, costToday, runsToday, failuresToday, pendingApprovals, systemHealth }: KPIBarProps) {
  const metrics = [
    { label: 'Tokens In', value: tokensTodayIn.toLocaleString() },
    { label: 'Tokens Out', value: tokensTodayOut.toLocaleString() },
    { label: 'Cost Today', value: `$${costToday.toFixed(4)}` },
    { label: 'Runs Today', value: runsToday.toString() },
    { label: 'Failures', value: failuresToday.toString(), warn: failuresToday > 0 },
    { label: 'Pending Approvals', value: pendingApprovals.toString(), warn: pendingApprovals > 0 },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1px',
        background: '#111',
        border: '1px solid #2a2a2a',
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '16px',
      }}
    >
      {metrics.map((m) => (
        <div
          key={m.label}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRight: '1px solid #2a2a2a',
          }}
        >
          <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{m.label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: m.warn ? '#fb923c' : '#f4f4f5', fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
        </div>
      ))}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 80 }}>
        <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: systemHealth === 'healthy' ? '#22c55e' : systemHealth === 'degraded' ? '#f59e0b' : '#ef4444',
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>{systemHealth}</span>
        </div>
      </div>
    </div>
  );
}
