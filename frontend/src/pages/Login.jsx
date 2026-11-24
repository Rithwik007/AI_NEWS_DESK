import React from 'react';
import { SignIn, useAuth, useClerk } from '@clerk/clerk-react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import Spinner from '../components/Spinner';

export default function Login() {
  const { isSignedIn, isLoaded } = useAuth();
  const { signOut } = useClerk();
  const location = useLocation();
  const isExpired = new URLSearchParams(location.search).get('expired') === '1';

  if (isLoaded && isSignedIn && isExpired) {
    return <main className="setup-note">
      <h1>Sign in again</h1>
      <p>Your desk could not verify this session.</p>
      <button className="btn-primary" onClick={() => signOut({ redirectUrl: '/login' })}>Return to sign in</button>
    </main>;
  }
  if (isLoaded && isSignedIn) return <Navigate to="/desk" replace />;

  return (
    <div className="auth-page"
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
