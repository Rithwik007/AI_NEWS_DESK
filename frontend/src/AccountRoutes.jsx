import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';

import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import SignUpPage from './pages/SignUpPage';
import DigestSchedule from './pages/DigestSchedule';
import TelegramConnect from './pages/TelegramConnect';
import InterestEditor from './pages/InterestEditor';
import NotFound from './pages/NotFound';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function AccountRoutes() {
  if (!clerkPubKey) return (
    <main className="setup-note">
      <h1>Connect your Clerk application</h1>
      <p>Set VITE_CLERK_PUBLISHABLE_KEY in frontend/.env and restart Vite to enable account access.</p>
      <a href="/">Return to the front page</a>
    </main>
  );
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      signInUrl="/login"
      signUpUrl="/sign-up"
      fallbackRedirectUrl="/login"
    >
      <Routes>
        <Route path="/login/*" element={<Login />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />

        <Route path="/" element={<AppLayout />}>
          <Route path="digest" element={<DigestSchedule />} />
          <Route path="interests" element={<InterestEditor />} />
          <Route path="channels" element={<TelegramConnect />} />
          <Route path="telegram" element={<Navigate to="/channels" replace />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </ClerkProvider>
  );
}
