import React, { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useUser, useClerk } from '../utils/deskAuth';
import { apiFetch } from '../utils/api';
import { identifyUser, trackPageView, resetAnalytics } from '../utils/analytics';
import Spinner from './Spinner';

export default function AppLayout() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const location = useLocation();
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [syncing, setSyncing] = useState(true);

  const deliveryConnected = telegramLinked;
  const isAuthenticated = isSignedIn;

  // Track pageviews on location changes
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  // Identify authenticated user in PostHog
  useEffect(() => {
    if (user?.id) {
      identifyUser(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName,
      });
    }
  }, [user]);

  useEffect(() => {
    if (isLoaded && isAuthenticated) {
      // Sync user and check delivery channel statuses
      async function syncAndCheck() {
        setSyncing(true);
        try {
          // Call /api/auth/sync
          await apiFetch('/api/auth/sync', { method: 'POST' }, getToken);

          const status = await apiFetch('/api/telegram/status', {}, getToken);
          setTelegramLinked(Boolean(status?.linked));
        } catch (err) {
          console.error('[AppLayout] Sync error:', err);
        } finally {
          setSyncing(false);
        }
      }

      syncAndCheck();
    }
  }, [isLoaded, isAuthenticated, getToken]);

  if (!isLoaded || (isAuthenticated && syncing)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '1rem',
          backgroundColor: 'var(--color-paper)',
        }}
      >
        <Spinner size="lg" />
        <div style={{ fontFamily: 'var(--font-body)', color: 'var(--color-slate)', fontSize: '0.95rem' }}>
          Initializing news desk...
        </div>
      </div>
    );
  }

  if (isLoaded && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-container">
      {/* Desktop Persistent Left Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>AI News Desk</h2>
          <p>Personal Editorial Control</p>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/digest"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            id="nav-digest"
          >
            <span>Digest</span>
          </NavLink>

          <NavLink
            to="/interests"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            id="nav-interests"
          >
            <span>Interests</span>
          </NavLink>

          <NavLink
            to="/channels"
            className={({ isActive }) => `nav-link ${isActive || location.pathname === '/telegram' ? 'active' : ''}`}
            id="nav-channels"
          >
            <span>Delivery Channels</span>
            {deliveryConnected && (
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-signal)',
                  marginLeft: 'auto',
                }}
              />
            )}
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-snippet">
            {user?.primaryEmailAddress?.emailAddress || user?.fullName || 'Editor'}
          </div>
          {import.meta.env.VITE_AUTH_MODE !== 'none' && <button
            onClick={() => {
              resetAnalytics();
              signOut(() => navigate('/login'));
            }}
            className="btn-secondary"
            style={{ fontSize: '0.85rem', minHeight: '36px', padding: '0 0.75rem' }}
            id="btn-sign-out"
          >
            Sign out
          </button>}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="content-area">
        <Outlet context={{ deliveryConnected, telegramLinked, setTelegramLinked }} />
      </main>

      {/* Mobile Bottom Tab Bar (Thumb-reachable) */}
      <nav className="mobile-tab-bar" aria-label="Mobile navigation">
        <NavLink
          to="/digest"
          className={({ isActive }) => `tab-link ${isActive ? 'active' : ''}`}
          id="tab-digest"
        >
          <span>Digest</span>
        </NavLink>

        <NavLink
          to="/interests"
          className={({ isActive }) => `tab-link ${isActive ? 'active' : ''}`}
          id="tab-interests"
        >
          <span>Interests</span>
        </NavLink>

        <NavLink
          to="/channels"
          className={({ isActive }) => `tab-link ${isActive || location.pathname === '/telegram' ? 'active' : ''}`}
          id="tab-channels"
        >
          <span>Channels</span>
        </NavLink>
      </nav>
    </div>
  );
}
