import type { AppState } from '@/lib/event';

type TournamentSnapshot = {
  state: AppState;
  revision: number;
  updatedAt: string | null;
};

type BridgeResponse = {
  ok?: boolean;
  error?: string;
  configured?: boolean;
  valid?: boolean;
  token?: string;
  maxAge?: number;
  snapshot?: TournamentSnapshot;
};

export class VercelBridgeError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'VercelBridgeError';
  }
}

function bridgeConfig() {
  const baseUrl = process.env.SITES_BACKEND_URL?.replace(/\/$/, '');
  const bypassToken = process.env.SITES_BYPASS_TOKEN;
  const bridgeSecret = process.env.TOURNAMENT_BRIDGE_SECRET;
  if (!baseUrl || !bypassToken || !bridgeSecret) throw new Error('Vercel bridge configuration is incomplete.');
  return { baseUrl, bypassToken, bridgeSecret };
}

async function bridgeRequest(method: 'GET' | 'POST', query: string, body?: unknown): Promise<BridgeResponse> {
  const config = bridgeConfig();
  const requestInit: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      'oai-sites-authorization': `Bearer ${config.bypassToken}`,
      'x-vercel-bridge-secret': config.bridgeSecret,
    },
    cache: 'no-store',
  };
  if (method === 'POST') requestInit.body = JSON.stringify(body ?? {});
  const response = await fetch(`${config.baseUrl}/api/vercel-bridge${query}`, requestInit);
  const result = await response.json() as BridgeResponse;
  if (!response.ok) throw new VercelBridgeError(result.error || `Sites bridge request failed: ${response.status}`, response.status);
  return result;
}

export async function getVercelTournamentSnapshot(): Promise<TournamentSnapshot> {
  const result = await bridgeRequest('GET', '?action=tournament');
  if (!result.snapshot) throw new Error('Sites bridge returned no tournament data.');
  return result.snapshot;
}

export async function isVercelPasswordConfigured(): Promise<boolean> {
  return Boolean((await bridgeRequest('GET', '?action=password-status')).configured);
}

export async function verifyVercelSession(token: string | undefined, email: string): Promise<boolean> {
  if (!token) return false;
  return Boolean((await bridgeRequest('POST', '', { action: 'session', token, email })).valid);
}

export async function authenticateVercelAdmin(action: 'setup' | 'login', password: string, email: string): Promise<{ token: string; maxAge: number }> {
  const result = await bridgeRequest('POST', '', { action, password, email });
  if (!result.token || !result.maxAge) throw new Error('Sites bridge returned no administrator session.');
  return { token: result.token, maxAge: result.maxAge };
}

export async function logoutVercelAdmin(token: string | undefined): Promise<void> {
  if (!token) return;
  await bridgeRequest('POST', '', { action: 'logout', token });
}

export async function saveVercelTournament(state: unknown, token: string | undefined, email: string): Promise<TournamentSnapshot> {
  if (!token) throw new Error('管理者パスワードを入力してください。');
  const result = await bridgeRequest('POST', '', { action: 'save', state, token, email });
  if (!result.snapshot) throw new Error('Sites bridge returned no tournament data.');
  return result.snapshot;
}

