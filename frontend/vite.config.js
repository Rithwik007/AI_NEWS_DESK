import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const clerkKey =
    env.VITE_CLERK_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    env.CLERK_PUBLISHABLE_KEY ||
    'pk_test_b2JsaWdpbmctbWFjYXF1ZS01MzU4LmNsZXJrLmFjY291bnRzLmRldiQ';

  const posthogKey =
    env.VITE_POSTHOG_KEY ||
    env.POSTHOG_KEY ||
    process.env.VITE_POSTHOG_KEY ||
    process.env.POSTHOG_KEY ||
    '';

  const posthogHost =
    env.VITE_POSTHOG_HOST ||
    env.POSTHOG_HOST ||
    process.env.VITE_POSTHOG_HOST ||
    process.env.POSTHOG_HOST ||
    'https://us.i.posthog.com';

  const sentryDsn =
    env.VITE_SENTRY_DSN ||
    env.SENTRY_DSN ||
    process.env.VITE_SENTRY_DSN ||
    process.env.SENTRY_DSN ||
    '';

  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'POSTHOG_', 'SENTRY_'],
    define: {
      'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(clerkKey),
      'import.meta.env.VITE_POSTHOG_KEY': JSON.stringify(posthogKey),
      'import.meta.env.VITE_POSTHOG_HOST': JSON.stringify(posthogHost),
      'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(sentryDsn),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
