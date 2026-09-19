import { cookies } from 'next/headers';
import { isAdminUser } from '@/app/admin-access';
import { ADMIN_SESSION_COOKIE, getAdminSessionToken } from '@/app/admin-session';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  createAdminPassword,
  createAdminSession,
  deleteAdminSession,
  isAdminPasswordConfigured,
  validateAdminPassword,
  verifyAdminPassword,
} from '@/db/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'ChatGPTでのログインが必要です。' }, { status: 401 });
  if (!isAdminUser(user)) return Response.json({ error: '管理者権限がありません。' }, { status: 403 });

  try {
    const body = await request.json() as { action?: unknown; password?: unknown };
    if (body.action === 'logout') {
      await deleteAdminSession(await getAdminSessionToken());
      (await cookies()).delete(ADMIN_SESSION_COOKIE);
      return Response.json({ ok: true });
    }

    const passwordError = validateAdminPassword(body.password);
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
    const password = body.password as string;

    if (body.action === 'setup') {
      if (await isAdminPasswordConfigured()) return Response.json({ error: '管理者パスワードは設定済みです。' }, { status: 409 });
      await createAdminPassword(password, user.email);
    } else if (body.action === 'login') {
      if (!(await isAdminPasswordConfigured())) return Response.json({ error: '先に管理者パスワードを設定してください。' }, { status: 409 });
      if (!(await verifyAdminPassword(password))) return Response.json({ error: 'パスワードが違います。' }, { status: 401 });
    } else {
      return Response.json({ error: '操作の形式が正しくありません。' }, { status: 400 });
    }

    const session = await createAdminSession(user.email);
    const requestUrl = new URL(request.url);
    (await cookies()).set(ADMIN_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: requestUrl.protocol === 'https:',
      sameSite: 'strict',
      path: '/',
      maxAge: session.maxAge,
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Admin authentication failed', error);
    return Response.json({ error: '認証処理に失敗しました。少し待ってから再度お試しください。' }, { status: 500 });
  }
}
