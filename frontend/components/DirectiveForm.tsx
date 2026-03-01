'use client';

import { useState } from 'react';
import api from '../lib/api';

export default function DirectiveForm({ onSubmit }: { onSubmit?: () => void }) {
  const [transcript, setTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transcript.trim()) return;
    setSubmitting(true);
    setResult(null);

    try {
      // Governance: the Conductor (human operator) is the only party allowed to
      // create directives. We declare this via the X-Conductor-Role header so
      // the backend can enforce the rule.
      const data = await api.post<{ directive: { id: string }; task: { id: string } }>(
        '/api/directives',
        { transcript: transcript.trim() },
        { 'X-Conductor-Role': 'conductor' }
      );
      setResult({ success: true, message: `Directive created. CoS task ${data.task.id.slice(-8)} queued.` });
      setTranscript('');
      onSubmit?.();
    } catch (err) {
      setResult({ success: false, message: String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
          Tell the Chief of Staff...
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Describe what you need done. Be specific about objectives, context, and any constraints."
          rows={4}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
          disabled={submitting}
        />
      </div>
      {result && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            marginBottom: 10,
            fontSize: 13,
            background: result.success ? '#052e16' : '#450a0a',
            color: result.success ? '#4ade80' : '#f87171',
            border: `1px solid ${result.success ? '#14532d' : '#7f1d1d'}`,
          }}
        >
          {result.message}
        </div>
      )}
      <button className="btn btn-primary" type="submit" disabled={submitting || !transcript.trim()}>
        {submitting ? 'Submitting...' : 'Submit to Chief of Staff'}
      </button>
    </form>
  );
}
