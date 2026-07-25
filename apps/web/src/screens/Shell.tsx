import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { JobWatcher } from '../components/JobWatcher';

const links = [
  { to: '/', label: 'Today', end: true },
  { to: '/parcels', label: 'Parcels' },
  { to: '/map', label: 'Map' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/review', label: 'Review' },
  { to: '/admin', label: 'Admin' },
];

export function Shell() {
  const { logout } = useAuth();

  return (
    <div className="atmosphere grain min-h-screen">
      <JobWatcher />
      <header className="border-pine/40 relative z-10 border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-5 py-5 md:px-8">
          <div>
            <p className="text-moss mb-1 text-[10px] font-semibold tracking-[0.3em] uppercase">
              Lead Engine
            </p>
            <NavLink
              to="/"
              className="font-display text-3xl leading-none font-extrabold tracking-tight text-white md:text-4xl"
            >
              GREENVILLE <span className="text-moss">CRE</span>
            </NavLink>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  [
                    'px-3 py-2 text-sm font-semibold tracking-wide transition',
                    isActive ? 'text-moss' : 'text-fog hover:text-mist',
                  ].join(' ')
                }
              >
                {link.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={logout}
              className="text-fog hover:text-mist ml-2 px-3 py-2 text-sm"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-7xl px-5 py-8 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}
