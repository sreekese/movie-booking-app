import { useState } from 'react';
import { money } from '../api';
export default function TheatreStats({ data, theatre }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const shows = data.shows.filter(
    (s) =>
      (!theatre || s.theatre_id === theatre.id) &&
      (!from || s.date >= from) &&
      (!to || s.date <= to),
  );
  const ids = new Set(shows.map((s) => s.id));
  const bookings = data.bookings.filter((b) => ids.has(b.show_id));
  const reserved = bookings.filter((b) => b.status === 'reserved');
  const seats = reserved.reduce((n, b) => n + b.seats.length, 0);
  const capacity = shows.reduce((n, s) => n + s.capacity, 0);
  return (
    <div className="panel">
      <h2>{theatre?.name || 'Assigned theatres'} · Statistics</h2>
      <div className="filters">
        <label>
          Show date from
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Show date to
          <input
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <p className="muted">
        Totals use screening dates (IST). Occupancy includes all screenings in
        the selected period. Cancelled seats are excluded.
      </p>
      <div className="stats">
        {[
          ['Screenings', shows.length],
          [
            'Upcoming open shows',
            shows.filter((s) => s.active && new Date(s.starts_at) > new Date())
              .length,
          ],
          ['Reservations', reserved.length],
          ['Cancellations', bookings.length - reserved.length],
          ['Reserved seats', seats],
          [
            'Occupancy',
            `${capacity ? Math.round((seats / capacity) * 1000) / 10 : 0}%`,
          ],
          [
            'Reservation value · unpaid',
            money(reserved.reduce((n, b) => n + b.total, 0)),
          ],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Theatre / screen</th>
              <th>Movie</th>
              <th>Date / time</th>
              <th>Reserved seats</th>
              <th>Occupancy</th>
            </tr>
          </thead>
          <tbody>
            {shows.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.theatre.name} / {s.screen}
                </td>
                <td>
                  {data.movies.find((m) => m.id === s.movie_id)?.title ||
                    'Archived movie'}
                </td>
                <td>
                  {s.date} · {s.time}
                </td>
                <td>
                  {s.occupied} / {s.capacity}
                </td>
                <td>
                  {s.capacity
                    ? Math.round((s.occupied / s.capacity) * 1000) / 10
                    : 0}
                  %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
