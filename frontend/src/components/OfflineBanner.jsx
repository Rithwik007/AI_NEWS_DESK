import React, { useState, useEffect } from 'react';

/**
 * Global offline detection banner.
 * Displays when network connection drops, distinct from server error states.
 */
export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="offline-banner" role="alert" id="offline-status-banner">
      <span style={{ fontSize: '1rem' }}>⚡</span>
      <span>You are currently offline. Changes cannot be saved until connectivity is restored.</span>
    </div>
  );
}
