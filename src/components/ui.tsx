import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function CrossMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
      <rect x="24" y="4" width="16" height="56" rx="2" />
      <rect x="8" y="18" width="48" height="16" rx="2" />
    </svg>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-28 pt-6">{children}</div>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-stone-200/80 bg-white/90 p-5 shadow-card ${className}`}>{children}</section>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-indigo-700 text-white hover:bg-indigo-800 disabled:bg-indigo-300',
    secondary: 'bg-stone-200 text-stone-800 hover:bg-stone-300 disabled:bg-stone-100',
    ghost: 'bg-transparent text-indigo-800 hover:bg-indigo-50 disabled:text-stone-400',
  }[variant];

  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition ${styles} ${className}`}
      {...props}
    />
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-stone-600">{children}</label>;
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-base text-stone-900 outline-none ring-indigo-600/20 placeholder:text-stone-400 focus:border-indigo-600 focus:ring-4 ${props.className ?? ''}`}
    />
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{children}</p>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 font-serif text-2xl text-stone-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}
