import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';
import { getAuthToken } from '../utils/auth';
import { apiUrl } from '../utils/api';

export default function AppLayout() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const [telegramLinked, setTelegramLinked] = useState(false);

  const devToken = typeof window !== 'undefined' ? localStorage.getItem('dev_auth_token') : null;
  const isAuthenticated = isSignedIn || !!devToken;

  useEffect(() => {
    if (isLoaded && !isAuthenticated) {
      navigate('/login');
      return;
    }

    if (isAuthenticated) {
      // Sync user and check telegram status
      async function syncAndCheck() {
        try {
          const token = await getAuthToken(getToken);
          if (!token) return;

          // Call /api/auth/sync
          await fetch(apiUrl('/api/auth/sync'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });

          // Check Telegram status
          const statusRes = await fetch(apiUrl('/api/telegram/status'), {
            headers: { Authorization: `Bearer ${token}` },
          });
          const statusData = await statusRes.json();
          if (statusData && statusData.linked) {
            setTelegramLinked(true);
          }
        } catch (err) {
          console.error('[AppLayout] Sync error:', err);
        }
      }

      syncAndCheck();
    }
  }, [isLoaded, isAuthenticated, getToken, navigate]);

  if (isLoaded && !isAuthenticated) {
    return (
      <div style={{ padding: '3rem', fontFamily: 'var(--font-body)', color: 'var(--color-slate)' }}>
        Loading news desk...
      </div>
    );
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
            to="/telegram"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            id="nav-telegram"
          >
            <span>Telegram</span>
            {telegramLinked && (
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
          <button
            onClick={() => signOut(() => navigate('/login'))}
            className="btn-secondary"
            style={{ fontSize: '0.85rem', minHeight: '36px', padding: '0 0.75rem' }}
            id="btn-sign-out"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="content-area">
        <Outlet context={{ telegramLinked, setTelegramLinked }} />
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
          to="/telegram"
          className={({ isActive }) => `tab-link ${isActive ? 'active' : ''}`}
          id="tab-telegram"
        >
          <span>Telegram</span>
        </NavLink>
      </nav>
    </div>
  );
}
