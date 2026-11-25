import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/deskAuth';
import { apiFetch } from '../utils/api';

import { useNavigate, useOutletContext } from 'react-router-dom';

const editions = [
  ['both', 'Twice a day', '8:00 AM and 6:00 PM'],
  ['morning', 'Morning only', '8:00 AM'],
  ['evening', 'Evening only', '6:00 PM'],
];

export default function DigestSchedule() {
  const navigate = useNavigate();
  const { deliveryConnected } = useOutletContext() || {};

  const { getToken } = useAuth();
  const [saved, setSaved] = useState(null);
  const [choice, setChoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    apiFetch('/api/auth/me', {}, getToken).then(({ user }) => {
      if (active) {
        setSaved(user.digestSchedule || 'both');
        setChoice(user.digestSchedule || 'both');
      }
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [getToken, attempt]);

  async function saveSchedule(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const result = await apiFetch('/api/auth/schedule', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digestSchedule: choice }),
      }, getToken);
      setSaved(result.digestSchedule);
      setMessage('Schedule saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <h1>Daily Digest</h1>
      <p className="text-slate" style={{ marginBottom: '2rem' }}>
        Curated AI news briefings delivered to your connected channel.
      </p>

      <form className="digest-preferences" onSubmit={saveSchedule}>
        <fieldset disabled={!saved || saving}>
          <legend>Delivery schedule</legend>
          <p className="text-slate">Choose your editions. All times are India Standard Time (IST).</p>
          {editions.map(([value, label, time]) => (
            <label key={value} className="digest-choice">
              <input type="radio" name="digestSchedule" value={value} checked={choice === value}
                onChange={() => { setChoice(value); setMessage(''); setError(''); }} />
              <span><strong>{label}</strong><small>{time}</small></span>
            </label>
          ))}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {!saved && error
          ? <button type="button" className="btn-secondary" onClick={() => setAttempt(n => n + 1)}>Retry</button>
          : <button className="btn-primary" disabled={!saved || choice === saved || saving}>
              {saving ? 'Saving…' : 'Save schedule'}
            </button>}
        <span role="status">{!saved && !error ? 'Loading schedule…' : message}</span>
      </form>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {!deliveryConnected ? (
          <button
            onClick={() => navigate('/telegram')}
            className="btn-primary btn-full-mobile"
            id="btn-connect-telegram-prompt"
          >
            Connect Telegram to receive digests
          </button>
        ) : (
          <button
            onClick={() => navigate('/interests')}
            className="btn-primary btn-full-mobile"
            id="btn-tune-interests"
          >
            Tune interest weights
          </button>
        )}
      </div>
    </div>
  );
}
