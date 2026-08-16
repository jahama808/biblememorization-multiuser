import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import handler from '../../api/admin';

type JsonResponse = {
  status: number;
  body: Record<string, unknown>;
};

function invoke(method: string, url: string, body?: Record<string, unknown>): Promise<JsonResponse> {
  return new Promise((resolvePromise, reject) => {
    const fakeRes = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(payload: Record<string, unknown>) {
        resolvePromise({ status: this.statusCode, body: payload });
        return this;
      },
    };

    const parsed = new URL(url, 'http://localhost');
    const fakeReq = {
      method,
      url,
      query: Object.fromEntries(parsed.searchParams.entries()),
      headers: {},
      body: body ?? {},
    };

    Promise.resolve(handler(fakeReq as never, fakeRes as never)).catch(reject);
  });
}

describe('admin API handler', () => {
  it('keeps both Vercel entry files identical and free of relative src/api imports', () => {
    const root = resolve(__dirname, '../..');
    const source = readFileSync(resolve(root, 'api/admin.ts'), 'utf8');
    const routed = readFileSync(resolve(root, 'api/admin/[route].ts'), 'utf8');
    expect(source).toBe(routed);
    expect(source).toContain("from '@supabase/supabase-js'");
    expect(source).not.toMatch(/from ['"]\.\./);
    expect(source).not.toMatch(/from ['"]@\//);
  });

  it('returns JSON 401 for GET /api/admin/session without cookies', async () => {
    const result = await invoke('GET', '/api/admin/session');
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Not signed in' });
  });

  it('returns JSON 405 for GET /api/admin/login', async () => {
    const result = await invoke('GET', '/api/admin/login');
    expect(result.status).toBe(405);
    expect(result.body).toEqual({ error: 'Method not allowed' });
  });

  it('returns JSON 403 for POST /api/admin/login with a non-allowlisted email', async () => {
    const result = await invoke('POST', '/api/admin/login', { email: 'other@example.com', password: 'secret' });
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: 'Forbidden' });
  });

  it('returns JSON 401 for POST /api/admin/login with the allowlisted email and no password', async () => {
    const result = await invoke('POST', '/api/admin/login', { email: 'jay.garces@protonmail.com' });
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Invalid email or password' });
  });

  it('returns JSON 200 for POST /api/admin/logout without cookies', async () => {
    const result = await invoke('POST', '/api/admin/logout');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
  });
});
