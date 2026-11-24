import React from 'react';
import EditionPreview from '../components/EditionPreview';
import { useNavigate, useOutletContext } from 'react-router-dom';

export default function DigestSchedule() {
  const navigate = useNavigate();
  const { deliveryConnected } = useOutletContext() || {};

  return (
    <div style={{ maxWidth: '640px' }}>
      <h1>Daily Digest</h1>
      <p className="text-slate" style={{ marginBottom: '2rem' }}>
        Curated AI news briefings delivered to your connected channel.
      </p>

      <div className="desk-edition"><EditionPreview /></div>

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
