import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import FrontPage from './pages/FrontPage';
import OfflineBanner from './components/OfflineBanner';
import Spinner from './components/Spinner';

const AccountRoutes = lazy(() => import('./AccountRoutes'));

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function Home() {
  const { isSignedIn } = useAuth();
  return isSignedIn ? <Navigate to="/desk" replace /> : <FrontPage />;
}

export default function App() {
  const routes = (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={clerkKey ? <Home /> : <FrontPage />} />
        <Route path="*" element={<Suspense fallback={<Spinner />}><AccountRoutes /></Suspense>} />
      </Routes>
    </>
  );

  return (
    <BrowserRouter>
      {clerkKey ? (
        <ClerkProvider
          publishableKey={clerkKey}
          signInUrl="/login"
          signUpUrl="/sign-up"
          signInForceRedirectUrl="/desk"
          signUpForceRedirectUrl="/desk"
        >
          {routes}
        </ClerkProvider>
      ) : routes}
    </BrowserRouter>
  );
}
