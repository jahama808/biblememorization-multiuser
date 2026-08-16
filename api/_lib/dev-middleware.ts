import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import adminHandler from '../admin';
import bibleHandler from '../bible';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

function queryFromUrl(url: string): Record<string, string> {
  const parsed = new URL(url, 'http://localhost');
  return Object.fromEntries(parsed.searchParams.entries());
}

function matchHandler(pathname: string): Handler | null {
  if (pathname === '/api/bible') return bibleHandler;
  if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) return adminHandler;
  return null;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function localApiPlugin() {
  return {
    name: 'local-scripture-api',
    configureServer(server: {
      middlewares: {
        use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        const pathname = url.split('?')[0] ?? '';
        const handler = matchHandler(pathname);
        if (!handler) {
          next();
          return;
        }

        void (async () => {
          const body = await readBody(req);
          const fakeReq = {
            method: req.method,
            query: queryFromUrl(url),
            headers: req.headers,
            body,
            url,
          };

          const fakeRes = {
            status(code: number) {
              res.statusCode = code;
              return fakeRes;
            },
            setHeader(name: string, value: string | string[]) {
              res.setHeader(name, value);
              return fakeRes;
            },
            json(payload: unknown) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(payload));
              return fakeRes;
            },
          };

          await handler(fakeReq as never, fakeRes as never);
        })().catch((error: unknown) => {
          if (res.writableEnded) return;
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Server error' }));
        });
      });
    },
  };
}
