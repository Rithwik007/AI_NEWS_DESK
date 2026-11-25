import React from 'react';
import { Routes, Route, Navigate, useOutletContext } from 'react-router-dom';

import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import SignUpPage from './pages/SignUpPage';
import DigestSchedule from './pages/DigestSchedule';
import TelegramConnect from './pages/TelegramConnect';
import InterestEditor from './pages/InterestEditor';
import NotFound from './pages/NotFound';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function DeskEntry() {
  const { deliveryConnected } = useOutletContext();
  return <Navigate to={deliveryConnected ? '/interests' : '/channels'} replace />;
}

export default function AccountRoutes() {
  const personal = import.meta.env.VITE_AUTH_MODE === 'none';
  if (!personal && !clerkPubKey) return (
    <main className="setup-note">
      <h1>Connect your Clerk application</h1>
      <p>Set VITE_CLERK_PUBLISHABLE_KEY in frontend/.env and restart Vite to enable account access.</p>
      <a href="/">Return to the front page</a>
    </main>
  );
  return (
    <Routes>
      <Route path="/login/*" element={personal ? <Navigate to="/desk" replace /> : <Login />} />
      <Route path="/sign-up/*" element={personal ? <Navigate to="/desk" replace /> : <SignUpPage />} />

      <Route path="/" element={<AppLayout />}>
        <Route path="desk" element={<DeskEntry />} />
        <Route path="digest" element={<DigestSchedule />} />
        <Route path="interests" element={<InterestEditor />} />
        <Route path="channels" element={<TelegramConnect />} />
        <Route path="telegram" element={<Navigate to="/channels" replace />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
