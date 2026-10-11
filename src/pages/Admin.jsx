import { useEffect, useState } from 'react';
import { api, dateLabel, money } from '../api';
import movies from '../data/data';
export default function Admin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [movieId, setMovieId] = useState('1');
  useEffect(() => {
    api('/admin')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const toggle = async (show) => {
    setBusy(show.id);
    setError('');
    try {
      await api(`/admin/shows/${show.id}`, {
        method: 'PATCH',
        body: { active: !show.active },
      });
      setData(await api('/admin'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };
  return (
    <section className="container page">
      <p className="eyebrow accent">CINEMA OPERATIONS</p>
      <h1>Admin dashboard</h1>
      <p className="muted">
        Manage the sample screening programme and review unpaid reservations.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading dashboard…</p>}
      {data && (
        <>
          <div className="stats">
            <div className="panel">
              <span>Registered accounts</span>
              <strong>{data.users}</strong>
            </div>
            <div className="panel">
              <span>Active reservations</span>
              <strong>
                {data.bookings.filter((b) => b.status === 'reserved').length}
              </strong>
            </div>
            <div className="panel">
              <span>Reserved value · unpaid</span>
              <strong>
                {money(
                  data.bookings
                    .filter((b) => b.status === 'reserved')
                    .reduce((s, b) => s + b.total, 0),
                )}
              </strong>
            </div>
          </div>
          <div className="section-heading">
            <h2>Upcoming screenings</h2>
            <label>
              Movie
              <select
                value={movieId}
                onChange={(e) => setMovieId(e.target.value)}
              >
                {movies.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted">
            Screenings with reservations cannot be disabled.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time (IST)</th>
                  <th>Reserved seats</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.shows
                  .filter((s) => s.movie_id === Number(movieId))
                  .map((s) => (
                    <tr key={s.id}>
                      <td>{dateLabel(s.date)}</td>
                      <td>{s.time}</td>
                      <td>{s.occupied} / 96</td>
                      <td>{s.active ? 'Open' : 'Disabled'}</td>
                      <td>
                        <button
                          className="button secondary small"
                          disabled={!!busy || (!!s.active && s.occupied > 0)}
                          onClick={() => toggle(s)}
                        >
                          {s.active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <h2 className="section-title">All reservations</h2>
          {!data.bookings.length ? (
            <p className="muted">No reservations yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Customer</th>
                    <th>Movie & show</th>
                    <th>Seats</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((b) => (
                    <tr key={b.id}>
                      <td>{b.id}</td>
                      <td>
                        {b.name}
                        <br />
                        <small>{b.email}</small>
                      </td>
                      <td>
                        {b.movie.title}
                        <br />
                        <small>
                          {dateLabel(b.date)} · {b.time}
                        </small>
                      </td>
                      <td>{b.seats.join(', ')}</td>
                      <td>{money(b.total)}</td>
                      <td>{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
