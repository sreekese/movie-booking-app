import LoadingSkeleton from './LoadingSkeleton';
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, Clapperboard } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context';
export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, logout, ready } = useApp();
  const navigate = useNavigate();
  return (
    <header className="site-header">
      <Link
        to={['admin', 'theatre_admin'].includes(user?.role) ? '/admin' : '/'}
        className="brand"
        onClick={() => setOpen(false)}
      >
        <Clapperboard />
        <span>
          quick<span>show</span>
          <small>MAKE IT A MOVIE NIGHT</small>
        </span>
      </Link>
      <button
        className="menu-toggle icon-button"
        aria-label="Toggle navigation"
        aria-expanded={open}
        aria-controls="main-nav"
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Menu />}
      </button>
      <nav
        id="main-nav"
        className={open ? 'open' : ''}
        aria-label="Main navigation"
      >
        {(['admin', 'theatre_admin'].includes(user?.role)
          ? [['/admin', 'Admin dashboard']]
          : [
              ['/', 'Home'],
              ['/movies', 'Movies'],
              ['/theater', 'Cinema'],
              ['/favourite', 'Favourites'],
              ['/my-bookings', 'My bookings'],
            ]
        ).map(([to, label]) => (
          <NavLink key={to} to={to} end onClick={() => setOpen(false)}>
            {label}
          </NavLink>
        ))}
        {!ready ? (
          <LoadingSkeleton variant="account" label="Loading account…" />
        ) : user ? (
          <button
            className="button small secondary"
            onClick={async () => {
              try {
                await logout();
                setOpen(false);
                navigate('/');
              } catch (e) {
                toast.error(e.message);
              }
            }}
          >
            Sign out
          </button>
        ) : (
          <Link
            className="button small"
            to="/login"
            onClick={() => setOpen(false)}
          >
            Sign in ↗
          </Link>
        )}
      </nav>
    </header>
  );
}
