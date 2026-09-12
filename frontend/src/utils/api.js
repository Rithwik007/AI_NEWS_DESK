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
