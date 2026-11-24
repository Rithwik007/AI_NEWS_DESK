import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import FrontPage from './pages/FrontPage';
import OfflineBanner from './components/OfflineBanner';
import Spinner from './components/Spinner';

const AccountRoutes = lazy(() => import('./AccountRoutes'));

export default function App() {
  return (
    <BrowserRouter>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<FrontPage />} />
        <Route path="*" element={<Suspense fallback={<Spinner />}><AccountRoutes /></Suspense>} />
      </Routes>
    </BrowserRouter>
  );
}
