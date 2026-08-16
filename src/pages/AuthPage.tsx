import { FormEvent, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button, Card, CrossMark, ErrorNote, FieldLabel, Screen, TextInput } from '../components/ui';

export function AuthPage() {
  const { configured, sendCode, verifyCode } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSend(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await sendCode(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a sign-in code');
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyCode(email.trim(), code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not work');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-6 pb-16">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-700 text-white">
            <CrossMark className="h-8 w-8" />
          </div>
          <h1 className="font-serif text-4xl text-stone-900">Scripture Memory</h1>
          <p className="mt-2 text-stone-600">Hide God&apos;s Word in your heart</p>
        </div>

        <Card>
          <h2 className="font-serif text-2xl text-stone-900">Sign in</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            We&apos;ll email you a 6-digit code. New accounts are created automatically.
          </p>

          {!configured ? (
            <ErrorNote>
              Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> before signing in.
            </ErrorNote>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={sent ? onVerify : onSend}>
              <div>
                <FieldLabel>Email address</FieldLabel>
                <TextInput
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              {sent ? (
                <div>
                  <FieldLabel>6-digit code</FieldLabel>
                  <TextInput
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                  />
                </div>
              ) : null}
              <ErrorNote>{error}</ErrorNote>
              <Button type="submit" className="w-full" disabled={busy || !configured}>
                {busy ? 'Please wait…' : sent ? 'Verify code' : 'Send Code'}
              </Button>
              {sent ? (
                <Button type="button" variant="ghost" className="w-full" onClick={() => setSent(false)}>
                  Use a different email
                </Button>
              ) : null}
            </form>
          )}

          <p className="mt-5 text-center text-xs text-stone-500">No password required. Enter the 6-digit code from your email.</p>
        </Card>
      </div>
    </Screen>
  );
}
