import { getAuthToken } from './auth';

/**
 * API configuration and URL resolution helper.
 * If VITE_API_BASE_URL is set (e.g. deployed backend URL), prepends it.
 * Otherwise uses relative paths (for dev proxy or Vercel rewrites).
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function apiUrl(endpoint) {
  if (!API_BASE_URL) return endpoint;
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${path}`;
}

/**
 * Uniform API fetch wrapper with:
 * - Base URL resolution
 * - Automatic Bearer token attachment
 * - Offline detection
 * - 401 Session expiry handling (redirects to /login?expired=1)
 * - Standardized error extraction
 *
 * @param {string} endpoint
 * @param {RequestInit} [options]
 * @param {Function} [getTokenFn]
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiFetch(endpoint, options = {}, getTokenFn = null) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const offlineErr = new Error("You're offline. Check your internet connection.");
    offlineErr.isOffline = true;
    throw offlineErr;
  }

  const url = apiUrl(endpoint);
  const headers = new Headers(options.headers || {});

  if (!headers.has('Authorization') && getTokenFn) {
    const token = await getAuthToken(getTokenFn);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    console.error(`[apiFetch] Network error calling ${endpoint}:`, networkErr);
    const err = new Error('Network error — unable to reach server. Please check your connection.');
    err.isNetwork = true;
    throw err;
  }

  if (response.status === 401) {
    console.warn('[apiFetch] 401 Unauthorized encountered. Redirecting to login...');
    if (typeof window !== 'undefined') {
      window.location.href = '/login?expired=1';
    }
    const err = new Error('Your session expired — please sign in again.');
    err.status = 401;
    throw err;
  }

  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message = (data && data.message) || (data && data.error) || response.statusText || 'Request failed';
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}
