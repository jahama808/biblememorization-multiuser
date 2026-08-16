import { NavLink, Outlet } from 'react-router-dom';
import { CrossMark } from '../components/ui';

const links = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/users', label: 'Users', end: false },
  { to: '/admin/invite', label: 'Invite', end: false },
  { to: '/admin/stats', label: 'Stats', end: false },
];

export function AdminLayout({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200/80 bg-white/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3 text-indigo-800">
            <CrossMark className="h-7 w-7" />
            <div>
              <p className="font-serif text-lg leading-tight text-stone-900">Scripture Memory · Admin</p>
              <p className="text-xs text-stone-500">{email}</p>
            </div>
          </div>
          <button type="button" onClick={onSignOut} className="text-sm font-semibold text-stone-500 hover:text-stone-800">
            Sign out
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-3 pb-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `rounded-2xl px-3 py-2 text-sm font-semibold ${isActive ? 'bg-indigo-50 text-indigo-800' : 'text-stone-500'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
