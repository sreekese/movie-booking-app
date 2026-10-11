import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, dateLabel, money } from '../api';
function download(booking) {
  const text = `QUICK SHOW — UNPAID DEMO RESERVATION\nNot valid for admission\n\nReference: ${booking.id}\nMovie: ${booking.movie.title}\nCinema: Quick Show Cinema, Screen ${booking.movie_id}\nDate: ${dateLabel(booking.date)}\nTime: ${booking.time} IST\nSeats: ${booking.seats.join(', ')}\nTotal: ${money(booking.total)}\nStatus: ${booking.status}\nPayment: Not collected\n`;
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/plain;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${booking.id}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
export default function MyBookings() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [params] = useSearchParams();
  useEffect(() => {
    api('/bookings')
      .then(setBookings)
      .catch((e) => setError(e.message));
  }, []);
  const cancel = async (id) => {
    setBusy(true);
    try {
      await api(`/bookings/${id}/cancel`, { method: 'POST' });
      setBookings((list) =>
        list.map((b) => (b.id === id ? { ...b, status: 'cancelled' } : b)),
      );
      setConfirm('');
      toast.success('Reservation cancelled. Seats released.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="container page">
      <p className="eyebrow accent">ALL YOUR PLANS, IN ONE PLACE</p>
      <h1>My reservations</h1>
      {params.get('reservation') &&
        bookings?.some((b) => b.id === params.get('reservation')) && (
          <div className="success" role="status">
            Your seats are reserved. Reference: {params.get('reservation')}. No
            payment has been collected.
          </div>
        )}
      <div className="chips no-print">
        {['all', 'upcoming', 'past', 'cancelled'].map((f) => (
          <button
            key={f}
            className={`chip ${filter === f ? 'selected' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}{' '}
          <button onClick={() => window.location.reload()}>Retry</button>
        </p>
      )}
      {!bookings && !error && <p role="status">Loading reservations…</p>}
      {bookings
        ?.filter(
          (b) =>
            filter === 'all' ||
            (filter === 'cancelled'
              ? b.status === 'cancelled'
              : b.status !== 'cancelled' &&
                (filter === 'upcoming'
                  ? new Date(b.starts_at) > new Date()
                  : new Date(b.starts_at) <= new Date())),
        )
        .map((b) => (
          <article className="panel reservation" key={b.id}>
            <img src={b.movie.poster} alt={b.movie.title} />
            <div className="reservation-details">
              <span className={`status ${b.status}`}>
                {b.status === 'cancelled' ? 'Cancelled' : 'Reserved · Unpaid'}
              </span>
              <h2>{b.movie.title}</h2>
              <p>
                {dateLabel(b.date)} · {b.time} IST
              </p>
              <p className="muted">
                Quick Show Cinema · Screen {b.movie_id}
                <br />
                Seats {b.seats.join(', ')}
              </p>
              <code>{b.id}</code>
              <p className="small-text muted">
                Demo reservation · Not valid for admission
              </p>
            </div>
            <div className="reservation-actions">
              <strong className="price">{money(b.total)}</strong>
              <span className="muted small-text">No payment collected</span>
              <button
                className="button secondary small"
                onClick={() => download(b)}
              >
                <Download size={16} /> Download summary
              </button>
              <button
                className="text-link no-print"
                onClick={() => window.print()}
              >
                <Printer size={16} /> Print reservations
              </button>
              {b.status !== 'cancelled' &&
                new Date(b.starts_at) > new Date() && (
                  <button
                    className="text-link no-print"
                    onClick={() => setConfirm(b.id)}
                  >
                    Cancel reservation
                  </button>
                )}
              {confirm === b.id && (
                <div
                  className="cancel-confirm no-print"
                  role="group"
                  aria-label="Confirm cancellation"
                >
                  <p>Release these seats?</p>
                  <div className="actions">
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() => cancel(b.id)}
                    >
                      {busy ? 'Cancelling…' : 'Yes, cancel'}
                    </button>
                    <button
                      className="button small secondary"
                      disabled={busy}
                      onClick={() => setConfirm('')}
                    >
                      Keep
                    </button>
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}
      {bookings &&
        !bookings.some(
          (b) =>
            filter === 'all' ||
            (filter === 'cancelled'
              ? b.status === 'cancelled'
              : b.status !== 'cancelled' &&
                (filter === 'upcoming'
                  ? new Date(b.starts_at) > new Date()
                  : new Date(b.starts_at) <= new Date())),
        ) && (
          <div className="empty">
            <h2>No {filter === 'all' ? '' : filter} reservations yet</h2>
            <p>Your next big-screen escape is waiting.</p>
            <Link className="button" to="/movies">
              Find a movie
            </Link>
          </div>
        )}
    </section>
  );
}
