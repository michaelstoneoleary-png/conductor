'use client';

import { useState } from 'react';

interface Artifact {
  id: string;
  type: string;
  title: string;
  summary: string;
  contentJson: unknown;
  visibility: string;
  createdAt: string;
}

const typeColors: Record<string, string> = {
  EXEC_SUMMARY: '#6366f1',
  PRD: '#0ea5e9',
  UX_SPEC: '#a855f7',
  CODE_CHANGE: '#10b981',
  CODE_REVIEW: '#f59e0b',
  QA_REPORT: '#ef4444',
  RESEARCH: '#06b6d4',
  GROWTH_PLAN: '#f97316',
  PERSONAL_TASK: '#84cc16',
  COS_PLAN: '#6366f1',
};

export default function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [expanded, setExpanded] = useState(false);
  const color = typeColors[artifact.type] ?? '#888';

  return (
    <div className="card" style={{ padding: '14px', borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{artifact.type}</span>
            {artifact.visibility === 'exec' && (
              <span style={{ fontSize: 9, color: '#6366f1', border: '1px solid #6366f1', borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase' }}>EXEC</span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>{artifact.title}</div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{artifact.summary}</div>
      <div style={{ fontSize: 11, color: '#555' }}>{new Date(artifact.createdAt).toLocaleString()}</div>
      {expanded && (
        <pre
          style={{
            marginTop: 10,
            padding: 10,
            background: '#0a0a0a',
            borderRadius: 4,
            fontSize: 11,
            color: '#9ca3af',
            overflow: 'auto',
            maxHeight: 300,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {JSON.stringify(artifact.contentJson, null, 2)}
        </pre>
      )}
    </div>
  );
}
