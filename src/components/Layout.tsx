import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/practice', label: 'Practice', end: false },
  { to: '/stats', label: 'Stats', end: false },
  { to: '/book-setup', label: 'Book', end: false },
];

export function Layout() {
  return (
    <div className="min-h-dvh">
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `rounded-2xl px-2 py-2 text-center text-xs font-semibold ${
                  isActive ? 'bg-indigo-50 text-indigo-800' : 'text-stone-500'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
