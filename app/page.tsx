import { TournamentApp } from '@/app/tournament-client';
import { getTournamentSnapshot } from '@/db/tournament';
import { createInitialAppState } from '@/lib/event';
import { isVercelRuntime } from '@/lib/runtime';
import { getVercelTournamentSnapshot } from '@/lib/vercel-bridge';

export const dynamic = 'force-dynamic';

export default async function ParticipantPage() {
  try {
    const snapshot = isVercelRuntime()
      ? await getVercelTournamentSnapshot()
      : await getTournamentSnapshot();
    return <TournamentApp initialState={snapshot.state} mode="participant" />;
  } catch (error) {
    console.error('Failed to render participant page', error);
    return <TournamentApp initialState={createInitialAppState()} mode="participant" initialLoadError="共有データを読み込めませんでした。少し待ってから再読み込みしてください。" />;
  }
}

