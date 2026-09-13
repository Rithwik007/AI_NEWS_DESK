import React, { useEffect } from 'react';
import { SignUp, useAuth } from '@clerk/clerk-react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import Spinner from '../components/Spinner';

export default function SignUpPage() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    async function handlePostSignUp() {
      try {
        // 1. Sync Clerk user to backend User collection
        await apiFetch('/api/auth/sync', { method: 'POST' }, getToken);

        // 2. Check if user already has Telegram linked
        const statusData = await apiFetch('/api/telegram/status', {}, getToken);

        if (statusData && statusData.linked) {
          navigate('/interests');
        } else {
          navigate('/telegram');
        }
      } catch (err) {
        console.error('[SignUp] Post-signup check failed:', err);
        navigate('/interests');
      }
    }

    handlePostSignUp();
  }, [isLoaded, isSignedIn, getToken, navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        backgroundColor: 'var(--color-paper)',
      }}
    >
      <div style={{ maxWidth: '420px', width: '100%', marginBottom: '1.5rem', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>AI News Desk</h1>
        <p className="text-slate" style={{ fontSize: '0.95rem' }}>
          Create an account to manage your personal AI news delivery.
        </p>
      </div>

      {!isLoaded ? (
        <div className="loading-container" style={{ minHeight: '380px', justifyContent: 'center', flexDirection: 'column' }}>
          <Spinner size="lg" />
          <p style={{ marginTop: '0.5rem' }}>Loading authentication...</p>
        </div>
      ) : (
        <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/login"
        appearance={{
          variables: {
            colorPrimary: '#1E2430',
            colorBackground: '#FAF9F5',
            colorText: '#1E2430',
            colorTextSecondary: '#5B6472',
            colorInputBackground: '#FAF9F5',
            colorInputText: '#1E2430',
            fontFamily: "'IBM Plex Sans', sans-serif",
            borderRadius: '4px',
          },
          elements: {
            card: {
              boxShadow: 'none',
              border: '1px solid var(--color-hairline)',
              backgroundColor: '#FAF9F5',
            },
            formButtonPrimary: {
              backgroundColor: '#1E2430',
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: '0.95rem',
              fontWeight: '500',
              textTransform: 'none',
              borderRadius: '4px',
              minHeight: '44px',
              '&:hover': {
                backgroundColor: '#2D3646',
              },
            },
            socialButtonsBlockButton: {
              border: '1px solid var(--color-hairline)',
              borderRadius: '4px',
              minHeight: '44px',
              '&:hover': {
                backgroundColor: 'var(--color-paper-muted)',
              },
            },
            headerTitle: {
              fontFamily: "'Fraunces', Georgia, serif",
              color: '#1E2430',
            },
            headerSubtitle: {
              color: '#5B6472',
            },
            footer: {
              display: 'none',
            },
          },
        }}
      />
    )}

      <p className="text-slate" style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: 'var(--color-ink)', fontWeight: '600', textDecoration: 'underline' }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
