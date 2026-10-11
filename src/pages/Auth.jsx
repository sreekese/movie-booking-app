import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
export default function Auth() {
  const { user, setUser } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const destination =
    location.state?.from?.startsWith('/') &&
    !location.state.from.startsWith('//')
      ? location.state.from
      : '/my-bookings';
  if (user) return <Navigate to={destination} replace />;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api(register ? '/register' : '/login', {
        method: 'POST',
        body: data,
      });
      setUser(result.user);
      navigate(destination, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="container page auth-page">
      <div className="panel auth-panel">
        <p className="eyebrow accent">WELCOME TO QUICK SHOW</p>
        <h1>
          {register
            ? 'Join the movie club.'
            : 'Your next movie night starts here.'}
        </h1>
        <p className="muted">Save favourites and manage your reservations.</p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              minLength={8}
              maxLength={128}
            />
            <small className="muted">Use 8–128 characters.</small>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button full" disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="muted">
          {register ? 'Already have an account?' : 'New around here?'}{' '}
          <button
            className="text-link"
            onClick={() => {
              setRegister(!register);
              setError('');
            }}
          >
            {register ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <small>
          By continuing, you accept our{' '}
          <Link className="text-link" to="/terms">
            booking terms
          </Link>{' '}
          and{' '}
          <Link className="text-link" to="/privacy">
            privacy notice
          </Link>
          .
        </small>
      </div>
    </section>
  );
}
