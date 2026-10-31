import { getChatGPTUser } from '@/app/chatgpt-auth';
import { isAdminUser } from '@/app/admin-access';
import { getAdminSessionToken, hasCurrentAdminSession } from '@/app/admin-session';
import { listPendingResults, reviewResultReport, submitResultReport } from '@/db/result-submissions';
import { ResultReportError } from '@/lib/result-submission';
import { isVercelRuntime, vercelAdminEmail } from '@/lib/runtime';
import { listVercelPendingResults, reviewVercelResult, submitVercelResult, VercelBridgeError } from '@/lib/vercel-bridge';

export const dynamic = 'force-dynamic';

async function authorizedAdminEmail(): Promise<string | null> {
  if (isVercelRuntime()) {
    const email = vercelAdminEmail();
    return email && await hasCurrentAdminSession(email) ? email : null;
  }
  const user = await getChatGPTUser();
  return user && isAdminUser(user) && await hasCurrentAdminSession(user.email) ? user.email : null;
}

function errorResponse(error: unknown): Response {
  console.error('Result submission request failed', error);
  if (error instanceof ResultReportError || error instanceof VercelBridgeError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: '結果の処理に失敗しました。少し待ってから再試行してください。' }, { status: 503 });
}

export async function GET() {
  try {
    const email = await authorizedAdminEmail();
    if (!email) return Response.json({ error: '管理者権限が必要です。' }, { status: 401 });
    const submissions = isVercelRuntime()
      ? await listVercelPendingResults(await getAdminSessionToken(), email)
      : await listPendingResults();
    return Response.json({ submissions }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: unknown; report?: unknown; id?: unknown };
    if (body.action === 'submit') {
      if (isVercelRuntime()) await submitVercelResult(body.report);
      else await submitResultReport(body.report);
      return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
    }
    if (body.action !== 'approve' && body.action !== 'reject') return Response.json({ error: '操作を確認してください。' }, { status: 400 });
    const email = await authorizedAdminEmail();
    if (!email) return Response.json({ error: '管理者権限が必要です。' }, { status: 401 });
    const id = typeof body.id === 'number' ? body.id : NaN;
    const snapshot = isVercelRuntime()
      ? await reviewVercelResult(id, body.action, await getAdminSessionToken(), email)
      : await reviewResultReport(id, body.action, email);
    return Response.json({ ok: true, snapshot }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}