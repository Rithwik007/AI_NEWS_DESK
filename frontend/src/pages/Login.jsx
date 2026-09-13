import React, { useEffect } from 'react';
import { SignIn, useAuth } from '@clerk/clerk-react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import Spinner from '../components/Spinner';

export default function Login() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isExpired = new URLSearchParams(location.search).get('expired') === '1';

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    async function handlePostLogin() {
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
        console.error('[Login] Redirect check failed:', err);
        navigate('/interests');
      }
    }

    handlePostLogin();
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
          Sign in to manage your interest profile and delivery channel.
        </p>
      </div>

      {isExpired && (
        <div className="session-expired-banner" role="alert" id="session-expired-banner">
          Your session expired — sign in again to continue.
        </div>
      )}

      {!isLoaded ? (
        <div className="loading-container" style={{ minHeight: '380px', justifyContent: 'center', flexDirection: 'column' }}>
          <Spinner size="lg" />
          <p style={{ marginTop: '0.5rem' }}>Loading authentication...</p>
        </div>
      ) : (
        <SignIn
        routing="path"
        path="/login"
        signUpUrl="/sign-up"
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
              display: 'none', // Remove Clerk footer marketing
            },
          },
        }}
      />
    )}

      <p className="text-slate" style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
        Don't have an account yet?{' '}
        <Link to="/sign-up" style={{ color: 'var(--color-ink)', fontWeight: '600', textDecoration: 'underline' }}>
          Create account
        </Link>
      </p>
    </div>
  );
}
