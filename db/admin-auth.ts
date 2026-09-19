import { env } from 'cloudflare:workers';

const CREDENTIAL_ID = 'primary';
const PBKDF2_ITERATIONS = 210_000;
const SESSION_DURATION_SECONDS = 12 * 60 * 60;

type CredentialRow = {
  password_hash: string;
  salt: string;
  iterations: number;
};

function database(): D1Database {
  const binding = (env as { DB?: D1Database }).DB;
  if (!binding) throw new Error('D1 database binding DB is unavailable.');
  return binding;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(salt), iterations }, key, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

export function validateAdminPassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'パスワードを入力してください。';
  if (password.length < 10) return 'パスワードは10文字以上で設定してください。';
  if (password.length > 128) return 'パスワードは128文字以内で設定してください。';
  return null;
}

export async function isAdminPasswordConfigured(): Promise<boolean> {
  const row = await database()
    .prepare('SELECT id FROM admin_credentials WHERE id = ?')
    .bind(CREDENTIAL_ID)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function createAdminPassword(password: string, updatedBy: string): Promise<void> {
  if (await isAdminPasswordConfigured()) throw new Error('管理者パスワードは設定済みです。');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);
  await database()
    .prepare('INSERT INTO admin_credentials (id, password_hash, salt, iterations, updated_at, updated_by) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)')
    .bind(CREDENTIAL_ID, passwordHash, bytesToBase64Url(salt), PBKDF2_ITERATIONS, updatedBy)
    .run();
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const credential = await database()
    .prepare('SELECT password_hash, salt, iterations FROM admin_credentials WHERE id = ?')
    .bind(CREDENTIAL_ID)
    .first<CredentialRow>();
  if (!credential) return false;
  const candidate = await derivePasswordHash(password, base64UrlToBytes(credential.salt), credential.iterations);
  return constantTimeEqual(candidate, credential.password_hash);
}

export async function createAdminSession(userEmail: string): Promise<{ token: string; maxAge: number }> {
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  await database()
    .prepare('INSERT INTO admin_sessions (token_hash, user_email, expires_at, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
    .bind(tokenHash, userEmail.toLowerCase(), expiresAt)
    .run();
  return { token, maxAge: SESSION_DURATION_SECONDS };
}

export async function hasValidAdminSession(token: string | undefined, userEmail: string): Promise<boolean> {
  if (!token) return false;
  const tokenHash = await sha256(token);
  const row = await database()
    .prepare('SELECT user_email, expires_at FROM admin_sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ user_email: string; expires_at: number }>();
  if (!row || row.user_email !== userEmail.toLowerCase() || row.expires_at <= Math.floor(Date.now() / 1000)) return false;
  return true;
}

export async function deleteAdminSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = await sha256(token);
  await database().prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(tokenHash).run();
}
