'use client';

import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AdminPasswordGate({ mode }: { mode: 'setup' | 'login' }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isSetup = mode === 'setup';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (isSetup && password !== confirmation) {
      setError('確認用パスワードが一致しません。');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: isSetup ? 'setup' : 'login', password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '認証できませんでした。');
      window.location.replace('/admin');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '認証できませんでした。');
      setSubmitting(false);
    }
  };

  return (
    <main className="access-page">
      <section className="access-card password-card">
        <span className="password-icon">{isSetup ? <ShieldCheck size={25} /> : <LockKeyhole size={25} />}</span>
        <p className="eyebrow">管理者画面</p>
        <h1>{isSetup ? '管理者パスワードを設定' : 'パスワードを入力'}</h1>
        <p>{isSetup ? '10文字以上のパスワードを設定してください。パスワードそのものは保存されません。' : '大会データを編集するには管理者パスワードが必要です。'}</p>
        <form className="password-form" onSubmit={submit}>
          <label htmlFor="admin-password"><span>パスワード</span><div className="password-input"><Input id="admin-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={128} autoComplete={isSetup ? 'new-password' : 'current-password'} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          {isSetup ? <label htmlFor="admin-password-confirm"><span>パスワード（確認）</span><Input id="admin-password-confirm" type={showPassword ? 'text' : 'password'} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={10} maxLength={128} autoComplete="new-password" required /></label> : null}
          {error ? <p className="password-error" role="alert">{error}</p> : null}
          <Button type="submit" disabled={submitting}>{submitting ? '確認中…' : isSetup ? '設定して管理画面へ' : '管理画面へ入る'}</Button>
        </form>
        <div className="access-actions"><a href="/">参加者画面へ戻る</a></div>
      </section>
    </main>
  );
}
