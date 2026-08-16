import { FormEvent, useState } from 'react';
import { Button, Card, CrossMark, ErrorNote, FieldLabel, TextInput } from '../../components/ui';
import { DEFAULT_ADMIN_EMAIL } from '../../lib/admin-access';
import { adminApi } from '../adminApi';

export function AdminLoginPage({ onSignedIn }: { onSignedIn: (mustChangePassword: boolean) => void }) {
  const [email, setEmail] = useState(DEFAULT_ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await adminApi.login(email.trim(), password);
      onSignedIn(result.mustChangePassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-700 text-white">
          <CrossMark className="h-7 w-7" />
        </div>
        <h1 className="font-serif text-3xl text-stone-900">Scripture Memory · Admin</h1>
        <p className="mt-2 text-sm text-stone-600">Email and password. Learners use a 6-digit code on the main app.</p>
      </div>
      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <FieldLabel>Email</FieldLabel>
            <TextInput type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div>
            <FieldLabel>Password</FieldLabel>
            <TextInput
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
