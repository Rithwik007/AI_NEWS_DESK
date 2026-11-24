import React from 'react';
import { SignUp, useAuth } from '@clerk/clerk-react';
import { Navigate, Link } from 'react-router-dom';
import Spinner from '../components/Spinner';

export default function SignUpPage() {
  const { isSignedIn, isLoaded } = useAuth();

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
