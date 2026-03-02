'use client';

import useSWR from 'swr';
import { useState } from 'react';
import api from '../../lib/api';

const fetcher = <T,>(path: string) => api.get<T>(path);

interface Agent {
  id: string;
  role: string;
  name: string;
  provider: string;
  model: string;
  isEnabled: boolean;
  status: string;
  confidenceAvg: number;
  tasksCompleted: number;
  tasksTotal: number;
  createdAt: string;
}

export default function AgentsPage() {
  const { data, mutate } = useSWR<Agent[]>('/api/agents', fetcher, { refreshInterval: 5000 });
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; model: string }>({ name: '', model: '' });
  const [newAgent, setNewAgent] = useState<{ role: string; name: string; provider: 'openai' | 'anthropic'; model: string }>({ role: '', name: '', provider: 'openai', model: '' });
  const [saving, setSaving] = useState(false);

  const toggleEnabled = async (agent: Agent) => {
    await api.patch(`/api/agents/${agent.id}`, { isEnabled: !agent.isEnabled });
    mutate();
  };

  const startEdit = (agent: Agent) => {
    setEditing(agent.id);
    setEditForm({ name: agent.name, model: agent.model });
  };

  const saveEdit = async (id: string) => {
    await api.patch(`/api/agents/${id}`, editForm);
    setEditing(null);
    mutate();
  };

  const createAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/agents', newAgent);
      setNewAgent({ role: '', name: '', provider: 'openai', model: '' });
      mutate();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f4f4f5', marginBottom: 20 }}>Agents</h1>

      <div className="panel" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr>
              <th>Role</th><th>Name</th><th>Provider</th><th>Model</th>
              <th>Status</th><th>Completed</th><th>Confidence</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((a) => (
              <tr key={a.id}>
                <td style={{ color: '#6366f1', fontWeight: 600 }}>{a.role}</td>
                <td>
                  {editing === a.id ? (
                    <input value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} style={{ padding: '4px 8px', fontSize: 12 }} />
                  ) : a.name}
                </td>
                <td style={{ color: '#888' }}>{a.provider}</td>
                <td>
                  {editing === a.id ? (
                    <input value={editForm.model} onChange={(e) => setEditForm(p => ({ ...p, model: e.target.value }))} style={{ padding: '4px 8px', fontSize: 12 }} />
                  ) : <span style={{ fontSize: 12, color: '#9ca3af' }}>{a.model}</span>}
                </td>
                <td><span className={`badge badge-${a.status}`}>{a.status}</span></td>
                <td style={{ color: '#9ca3af' }}>{a.tasksCompleted}/{a.tasksTotal}</td>
                <td style={{ color: '#9ca3af' }}>{(a.confidenceAvg * 100).toFixed(0)}%</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {editing === a.id ? (
                      <>
                        <button className="btn btn-success" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => saveEdit(a.id)}>Save</button>
                        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setEditing(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => startEdit(a)}>Edit</button>
                        <button
                          className={a.isEnabled ? 'btn btn-danger' : 'btn btn-success'}
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => toggleEnabled(a)}
                        >
                          {a.isEnabled ? 'Disable' : 'Enable'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>Add New Agent</h2>
        <form onSubmit={createAgent} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Role (unique)</label>
            <input value={newAgent.role} onChange={(e) => setNewAgent(p => ({ ...p, role: e.target.value }))} placeholder="e.g. Legal" required />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Name</label>
            <input value={newAgent.name} onChange={(e) => setNewAgent(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Legal Advisor" required />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Provider</label>
            <select value={newAgent.provider} onChange={(e) => setNewAgent(p => ({ ...p, provider: e.target.value as 'openai' | 'anthropic' }))}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Model</label>
            <input value={newAgent.model} onChange={(e) => setNewAgent(p => ({ ...p, model: e.target.value }))} placeholder="e.g. gpt-4o" required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving} style={{ whiteSpace: 'nowrap' }}>
            {saving ? 'Adding...' : 'Add Agent'}
          </button>
        </form>
      </div>
    </div>
  );
}
