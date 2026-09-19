export function isVercelRuntime(): boolean {
  return process.env.VERCEL === '1' || Boolean(process.env.SITES_BACKEND_URL);
}

export function vercelAdminEmail(): string | null {
  const value = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return value || null;
}

