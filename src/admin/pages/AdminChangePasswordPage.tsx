import { FormEvent, useState } from 'react';
import { Button, Card, ErrorNote, FieldLabel, TextInput } from '../../components/ui';
import { adminApi } from '../adminApi';

export function AdminChangePasswordPage({ onChanged }: { onChanged: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await adminApi.changePassword(password);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="font-serif text-3xl text-stone-900">Change admin password</h1>
      <p className="mt-2 text-sm text-stone-600">
        The bootstrap password works only for this first sign-in. Choose a new password of at least 8 characters. It cannot be
        the bootstrap password.
      </p>
      <Card className="mt-5">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <FieldLabel>New password</FieldLabel>
            <TextInput
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Confirm password</FieldLabel>
            <TextInput
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
