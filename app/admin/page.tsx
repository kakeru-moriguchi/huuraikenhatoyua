import { isAdminUser } from '@/app/admin-access';
import { AdminPasswordGate } from '@/app/admin-password-gate';
import { hasCurrentAdminSession } from '@/app/admin-session';
import { chatGPTSignOutPath, requireChatGPTUser } from '@/app/chatgpt-auth';
import { TournamentApp } from '@/app/tournament-client';
import { getTournamentSnapshot } from '@/db/tournament';
import { isAdminPasswordConfigured } from '@/db/admin-auth';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await requireChatGPTUser('/admin');
  if (!isAdminUser(user)) {
    return (
      <main className="access-page">
        <section className="access-card">
          <p className="eyebrow">管理者画面</p>
          <h1>管理者権限がありません</h1>
          <p>このアカウントでは大会データを編集できません。</p>
          <div className="access-actions"><a href="/">参加者画面へ</a><a href={chatGPTSignOutPath('/admin')}>別のアカウントでログイン</a></div>
        </section>
      </main>
    );
  }

  try {
    const passwordConfigured = await isAdminPasswordConfigured();
    if (!passwordConfigured) return <AdminPasswordGate mode="setup" />;
    if (!(await hasCurrentAdminSession(user.email))) return <AdminPasswordGate mode="login" />;
    const snapshot = await getTournamentSnapshot();
    return <TournamentApp initialState={snapshot.state} mode="admin" />;
  } catch (error) {
    console.error('Failed to render admin page', error);
    return (
      <main className="access-page">
        <section className="access-card">
          <p className="eyebrow">管理者画面</p>
          <h1>管理者画面を開けません</h1>
          <p>認証情報を確認できませんでした。少し待ってから再読み込みしてください。</p>
          <div className="access-actions"><a href="/">参加者画面へ</a></div>
        </section>
      </main>
    );
  }
}
