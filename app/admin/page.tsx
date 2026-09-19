import { isAdminUser } from '@/app/admin-access';
import { chatGPTSignOutPath, requireChatGPTUser } from '@/app/chatgpt-auth';
import { TournamentApp } from '@/app/tournament-client';
import { getTournamentSnapshot } from '@/db/tournament';
import { createInitialAppState } from '@/lib/event';

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
    const snapshot = await getTournamentSnapshot();
    return <TournamentApp initialState={snapshot.state} mode="admin" />;
  } catch (error) {
    console.error('Failed to render admin page', error);
    return <TournamentApp initialState={createInitialAppState()} mode="admin" initialLoadError="共有データを読み込めませんでした。入力は復旧後に行ってください。" />;
  }
}
