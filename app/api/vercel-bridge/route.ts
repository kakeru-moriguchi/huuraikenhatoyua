import { env } from 'cloudflare:workers';
import {
  createAdminPassword,
  createAdminSession,
  deleteAdminSession,
  hasValidAdminSession,
  isAdminPasswordConfigured,
  validateAdminPassword,
  verifyAdminPassword,
} from '@/db/admin-auth';
import { getTournamentSnapshot, saveTournamentState } from '@/db/tournament';

export const dynamic = 'force-dynamic';

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

function isAuthorized(request: Request): boolean {
  const configuredSecret = (env as { VERCEL_BRIDGE_SECRET?: string }).VERCEL_BRIDGE_SECRET;
  const suppliedSecret = request.headers.get('x-vercel-bridge-secret');
  return Boolean(configuredSecret && suppliedSecret && constantTimeEqual(configuredSecret, suppliedSecret));
}

function adminEmail(): string {
  const value = (env as { ADMIN_EMAIL?: string }).ADMIN_EMAIL?.trim().toLowerCase();
  if (!value) throw new Error('ADMIN_EMAIL is unavailable.');
  return value;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const action = new URL(request.url).searchParams.get('action');
    if (action === 'tournament') return Response.json({ snapshot: await getTournamentSnapshot() });
    if (action === 'password-status') return Response.json({ configured: await isAdminPasswordConfigured() });
    return Response.json({ error: 'Unknown bridge action.' }, { status: 400 });
  } catch (error) {
    console.error('Vercel bridge GET failed', error);
    return Response.json({ error: '共有データを取得できませんでした。' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const body = await request.json() as { action?: unknown; password?: unknown; token?: unknown; email?: unknown; state?: unknown };
    const expectedEmail = adminEmail();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (body.action === 'session') {
      return Response.json({ valid: email === expectedEmail && await hasValidAdminSession(typeof body.token === 'string' ? body.token : undefined, expectedEmail) });
    }
    if (body.action === 'logout') {
      await deleteAdminSession(typeof body.token === 'string' ? body.token : undefined);
      return Response.json({ ok: true });
    }
    if (body.action === 'save') {
      const token = typeof body.token === 'string' ? body.token : undefined;
      if (email !== expectedEmail || !(await hasValidAdminSession(token, expectedEmail))) return Response.json({ error: '管理者パスワードを入力してください。' }, { status: 401 });
      return Response.json({ snapshot: await saveTournamentState(body.state, expectedEmail) });
    }

    if (email !== expectedEmail) return Response.json({ error: '管理者権限がありません。' }, { status: 403 });
    const passwordError = validateAdminPassword(body.password);
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
    const password = body.password as string;
    if (body.action === 'setup') {
      if (await isAdminPasswordConfigured()) return Response.json({ error: '管理者パスワードは設定済みです。' }, { status: 409 });
      await createAdminPassword(password, expectedEmail);
    } else if (body.action === 'login') {
      if (!(await verifyAdminPassword(password))) return Response.json({ error: 'パスワードが違います。' }, { status: 401 });
    } else {
      return Response.json({ error: 'Unknown bridge action.' }, { status: 400 });
    }
    const session = await createAdminSession(expectedEmail);
    return Response.json({ token: session.token, maxAge: session.maxAge });
  } catch (error) {
    console.error('Vercel bridge POST failed', error);
    return Response.json({ error: '管理者処理に失敗しました。' }, { status: 500 });
  }
}

