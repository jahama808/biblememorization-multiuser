import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import bibleHandler from '../bible';
import changePasswordHandler from '../admin/change-password';
import inviteHandler from '../admin/invite';
import loginHandler from '../admin/login';
import logoutHandler from '../admin/logout';
import revokeHandler from '../admin/revoke';
import sessionHandler from '../admin/session';
import statsHandler from '../admin/stats';
import usersHandler from '../admin/users';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const routes: Array<{ method?: string; path: string; handler: Handler }> = [
  { path: '/api/bible', handler: bibleHandler },
  { method: 'POST', path: '/api/admin/login', handler: loginHandler },
  { method: 'POST', path: '/api/admin/change-password', handler: changePasswordHandler },
  { method: 'POST', path: '/api/admin/logout', handler: logoutHandler },
  { method: 'GET', path: '/api/admin/session', handler: sessionHandler },
  { method: 'GET', path: '/api/admin/users', handler: usersHandler },
  { method: 'POST', path: '/api/admin/invite', handler: inviteHandler },
  { method: 'POST', path: '/api/admin/revoke', handler: revokeHandler },
  { method: 'GET', path: '/api/admin/stats', handler: statsHandler },
];

function queryFromUrl(url: string): Record<string, string> {
  const parsed = new URL(url, 'http://localhost');
  return Object.fromEntries(parsed.searchParams.entries());
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
        const match = routes.find((route) => pathname === route.path && (!route.method || route.method === req.method));
        if (!match) {
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

          await match.handler(fakeReq as never, fakeRes as never);
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
