import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

export default function DigestSchedule() {
  const navigate = useNavigate();
  const { telegramLinked } = useOutletContext() || {};

  return (
    <div style={{ maxWidth: '640px' }}>
      <h1>Daily Digest</h1>
      <p className="text-slate" style={{ marginBottom: '2rem' }}>
        Curated AI news briefings delivered directly to your Telegram chat.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div
          style={{
            padding: '1.25rem',
            border: '1px solid var(--color-hairline)',
            borderRadius: '4px',
            backgroundColor: '#FAF9F5',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              Morning Briefing
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-slate)' }}>8:00 AM IST</span>
          </div>
          <p style={{ fontSize: '0.92rem', color: 'var(--color-slate)' }}>
            Full digest covering the top 5 high-priority AI stories from the last 24 hours, ranked by your interest weights.
          </p>
        </div>

        <div
          style={{
            padding: '1.25rem',
            border: '1px solid var(--color-hairline)',
            borderRadius: '4px',
            backgroundColor: '#FAF9F5',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              Evening Update
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-slate)' }}>6:00 PM IST</span>
          </div>
          <p style={{ fontSize: '0.92rem', color: 'var(--color-slate)' }}>
            Incremental briefing containing only breakthrough stories published since the morning run.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {!telegramLinked ? (
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
