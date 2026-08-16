import { FormEvent, useState } from 'react';
import { Button, Card, ErrorNote, FieldLabel, TextInput } from '../../components/ui';
import { adminApi } from '../adminApi';

export function AdminInvitePage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const result = await adminApi.invite(email.trim());
      setSuccess(`${result.user.email} can now request a 6-digit code on the main app.`);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not invite that email');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-3xl text-stone-900">Invite</h1>
      <p className="mt-2 text-sm text-stone-600">
        Add a learner email here. The main app does not allow self-signup. They sign in with a 6-digit email code.
      </p>
      <Card className="mt-5">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <FieldLabel>Email</FieldLabel>
            <TextInput
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="learner@example.com"
            />
          </div>
          <ErrorNote>{error}</ErrorNote>
          {success ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Inviting…' : 'Send invite'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
