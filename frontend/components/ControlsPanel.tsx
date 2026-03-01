'use client';

import { useState } from 'react';
import api from '../lib/api';

interface Settings {
  globalKillSwitch: boolean;
  dailyTokenCap: number;
  perRunTokenCap: number;
  maxParallelRuns: number;
  maxReviewLoops: number;
}

export default function ControlsPanel({ settings, onUpdate }: { settings: Settings; onUpdate: () => void }) {
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState(settings);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/api/settings', local);
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const toggleKillSwitch = async () => {
    const next = !local.globalKillSwitch;
    setLocal((p) => ({ ...p, globalKillSwitch: next }));
    await api.patch('/api/settings', { globalKillSwitch: next });
    onUpdate();
  };

  return (
    <div className="panel" style={{ padding: '16px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888' }}>System Controls</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: local.globalKillSwitch ? '#f87171' : '#888' }}>
            {local.globalKillSwitch ? 'KILL SWITCH ON' : 'Kill Switch'}
          </span>
          <button
            onClick={toggleKillSwitch}
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              border: 'none',
              background: local.globalKillSwitch ? '#ef4444' : '#374151',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 3,
                left: local.globalKillSwitch ? 21 : 3,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.2s',
              }}
            />
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {[
          { key: 'dailyTokenCap', label: 'Daily Token Cap' },
          { key: 'perRunTokenCap', label: 'Per-Run Token Cap' },
          { key: 'maxParallelRuns', label: 'Max Parallel Runs' },
          { key: 'maxReviewLoops', label: 'Max Review Loops' },
        ].map((f) => (
          <div key={f.key}>
            <label style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>{f.label}</label>
            <input
              type="number"
              value={local[f.key as keyof Settings] as number}
              onChange={(e) => setLocal((p) => ({ ...p, [f.key]: parseInt(e.target.value) || 0 }))}
              style={{ padding: '6px 10px', fontSize: 13 }}
            />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
