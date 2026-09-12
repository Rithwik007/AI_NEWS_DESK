import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';

import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import SignUpPage from './pages/SignUpPage';
import DigestSchedule from './pages/DigestSchedule';
import TelegramConnect from './pages/TelegramConnect';
import InterestEditor from './pages/InterestEditor';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function App() {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      signInUrl="/login"
      signUpUrl="/sign-up"
      fallbackRedirectUrl="/login"
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login/*" element={<Login />} />
          <Route path="/sign-up/*" element={<SignUpPage />} />

          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/digest" replace />} />
            <Route path="digest" element={<DigestSchedule />} />
            <Route path="interests" element={<InterestEditor />} />
            <Route path="telegram" element={<TelegramConnect />} />
          </Route>

          <Route path="*" element={<Navigate to="/digest" replace />} />
        </Routes>
      </BrowserRouter>
    </ClerkProvider>
  );
}
