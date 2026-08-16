/// <reference types="vitest/config" />
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { localApiPlugin } from './api/_lib/dev-middleware';

const SERVER_ENV = [
  'API_BIBLE_KEY',
  'BIBLE_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_BOOTSTRAP_PASSWORD',
  'ADMIN_EMAIL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const name of SERVER_ENV) {
    if (env[name] && !process.env[name]) {
      process.env[name] = env[name];
    }
  }

  return {
    plugins: [react(), localApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
