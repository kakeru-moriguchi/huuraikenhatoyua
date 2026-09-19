import { cookies } from 'next/headers';
import { hasValidAdminSession } from '@/db/admin-auth';
import { isVercelRuntime } from '@/lib/runtime';
import { verifyVercelSession } from '@/lib/vercel-bridge';

export const ADMIN_SESSION_COOKIE = 'tournament_admin_session';

export async function getAdminSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
}

export async function hasCurrentAdminSession(userEmail: string): Promise<boolean> {
  const token = await getAdminSessionToken();
  return isVercelRuntime()
    ? verifyVercelSession(token, userEmail)
    : hasValidAdminSession(token, userEmail);
}

