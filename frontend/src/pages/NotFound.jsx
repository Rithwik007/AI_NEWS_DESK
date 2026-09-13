import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '2rem 1rem',
      }}
      id="page-not-found"
    >
      <div style={{ maxWidth: '480px' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '0.5rem', color: 'var(--color-ink)' }}>
          404
        </h1>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--color-ink)' }}>
          Edition Not Found
        </h2>
        <p className="text-slate" style={{ marginBottom: '2rem', lineHeight: '1.6' }}>
          The editorial desk could not locate the story or page requested. It may have moved or been retired.
        </p>
        <button
          onClick={() => navigate('/digest')}
          className="btn-primary"
          id="btn-return-desk"
        >
          Return to news desk
        </button>
      </div>
    </div>
  );
}
