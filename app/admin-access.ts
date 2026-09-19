import { env } from 'cloudflare:workers';
import type { ChatGPTUser } from '@/app/chatgpt-auth';

export function isAdminUser(user: ChatGPTUser): boolean {
  const configuredEmail = (env as { ADMIN_EMAIL?: string }).ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
  return Boolean(configuredEmail && user.email.toLowerCase() === configuredEmail.trim().toLowerCase());
}
