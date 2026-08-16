/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import bibleHandler from './api/bible';

function queryFromUrl(url: string): Record<string, string> {
  const parsed = new URL(url, 'http://localhost');
  return Object.fromEntries(parsed.searchParams.entries());
}

function localBibleApi() {
  return {
    name: 'local-bible-api',
    configureServer(server: {
      middlewares: {
        use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/bible')) {
          next();
          return;
        }

        const fakeReq = {
          method: req.method,
          query: queryFromUrl(url),
          headers: req.headers,
        };

        const fakeRes = {
          status(code: number) {
            res.statusCode = code;
            return fakeRes;
          },
          setHeader(name: string, value: string) {
            res.setHeader(name, value);
            return fakeRes;
          },
          json(body: unknown) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(body));
            return fakeRes;
          },
        };

        void Promise.resolve(bibleHandler(fakeReq as never, fakeRes as never)).catch((error: unknown) => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Server error' }));
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.API_BIBLE_KEY && !process.env.API_BIBLE_KEY) {
    process.env.API_BIBLE_KEY = env.API_BIBLE_KEY;
  }
  if (env.BIBLE_API_KEY && !process.env.BIBLE_API_KEY) {
    process.env.BIBLE_API_KEY = env.BIBLE_API_KEY;
  }

  return {
    plugins: [react(), localBibleApi()],
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
