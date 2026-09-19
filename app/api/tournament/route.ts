import { getChatGPTUser } from '@/app/chatgpt-auth';
import { isAdminUser } from '@/app/admin-access';
import { hasCurrentAdminSession } from '@/app/admin-session';
import { getTournamentSnapshot, saveTournamentState } from '@/db/tournament';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await getTournamentSnapshot();
    return Response.json(snapshot, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Failed to load tournament state', error);
    return Response.json({ error: '大会データを取得できませんでした。' }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'ログインが必要です。' }, { status: 401 });
  if (!isAdminUser(user)) return Response.json({ error: '管理者権限がありません。' }, { status: 403 });
  if (!(await hasCurrentAdminSession(user.email))) return Response.json({ error: '管理者パスワードを入力してください。' }, { status: 401 });

  try {
    const body = await request.json() as { state?: unknown };
    const snapshot = await saveTournamentState(body.state, user.email);
    return Response.json(snapshot, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Failed to save tournament state', error);
    return Response.json({ error: '大会データを保存できませんでした。' }, { status: 400 });
  }
}
