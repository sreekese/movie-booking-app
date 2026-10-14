import ScreenManager from '../components/ScreenManager';
import TheatreStats from '../components/TheatreStats';
import { useEffect, useState } from 'react';
import {
  Plus,
  RefreshCw,
  Film,
  CalendarDays,
  Users,
  Ticket,
  History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, dateLabel, money } from '../api';
import { useApp } from '../context';
import AdminEditor from '../components/AdminEditor';
import LoadingSkeleton from '../components/LoadingSkeleton';

export default function Admin() {
  const { user, reloadCatalogue } = useApp();
  const superAdmin = user.role === 'admin';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('theatres');
  const [theatreId, setTheatreId] = useState('');
  const [query, setQuery] = useState('');
  const [movieFilter, setMovieFilter] = useState('');
  const [showScope, setShowScope] = useState('upcoming');
  const [editor, setEditor] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  useEffect(() => {
    api('/admin')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      setData(await api('/admin'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const mutate = async (path, method, body) => {
    const result = await api(path, { method, body });
    // The mutation is already committed even if a subsequent refresh fails.
    try {
      setData(await api('/admin'));
      await reloadCatalogue();
    } catch {
      setError('Changes saved. Refresh the dashboard to load the latest data.');
    }
    toast.success('Changes saved.');
    return result;
  };
  const confirm = (title, explanation, path, method, body) =>
    setConfirmation({ title, explanation, path, method, body });
  const matches = (...values) =>
    values.join(' ').toLowerCase().includes(query.toLowerCase());
  const movieTitle = (id) =>
    data.movies.find((m) => m.id === id)?.title || `Movie ${id}`;
  const theatre = data?.theatres.find((t) => t.id === Number(theatreId));
  const theatreShows =
    data?.shows.filter((s) => s.theatre_id === theatre?.id) || [];
  const theatreMovies =
    data?.movies.filter((m) => theatreShows.some((s) => s.movie_id === m.id)) ||
    [];
  const openTheatre = (id) => {
    setMovieFilter('');
    setTheatreId(String(id));
    setTab('programme');
    setQuery('');
    setConfirmation(null);
  };
  return (
    <section className="container page admin-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow accent">QUICK SHOW / CONTROL ROOM</p>
          <h1>Cinema management</h1>
          <p className="muted">
            {superAdmin
              ? 'Manage the catalogue, screenings, reservations, and accounts.'
              : 'Manage your assigned theatres, screenings, seating, and reservations.'}
          </p>
        </div>
        <button className="button secondary" disabled={busy} onClick={refresh}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && (
        <LoadingSkeleton
          variant="admin"
          label="Loading management dashboard…"
        />
      )}
      {data && (
        <>
          <div className="stats">
            <div className="panel">
              <span>Published movies</span>
              <strong>{data.movies.filter((m) => !m.archived).length}</strong>
            </div>
            <div className="panel">
              <span>
                {superAdmin ? 'Registered accounts' : 'Customers with bookings'}
              </span>
              <strong>{data.users}</strong>
            </div>
            <div className="panel">
              <span>Reserved value · unpaid</span>
              <strong>
                {money(
                  data.bookings
                    .filter((b) => b.status === 'reserved')
                    .reduce((sum, b) => sum + b.total, 0),
                )}
              </strong>
            </div>
          </div>
          <div className="admin-tabs" aria-label="Management sections">
            {[
              ['theatres', Film, 'Theatres'],
              ...(theatre
                ? [
                    ['programme', Film, 'Theatre movies'],
                    ['screens', Film, 'Screens & seating'],
                    ['shows', CalendarDays, 'Screenings & timings'],
                  ]
                : []),
              ['statistics', Film, 'Statistics'],
              ...(superAdmin ? [['movies', Film, 'Movie catalogue']] : []),
              ['bookings', Ticket, 'Reservations'],
              ...(superAdmin
                ? [
                    ['users', Users, 'Accounts'],
                    ['audit', History, 'Activity'],
                  ]
                : []),
            ].map(([key, Icon, label]) => (
              <button
                key={key}
                className={`chip ${tab === key ? 'selected' : ''}`}
                aria-pressed={tab === key}
                onClick={() => {
                  setTab(key);
                  setQuery('');
                  setConfirmation(null);
                }}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </div>
          {theatre &&
            ['programme', 'shows', 'screens', 'statistics'].includes(tab) && (
              <div className="panel">
                <h2>{theatre.name}</h2>
                <p className="muted">
                  {theatre.city} · {theatre.address}
                </p>
                <label>
                  Manage theatre{' '}
                  <select
                    value={theatreId}
                    onChange={(e) => {
                      setTheatreId(e.target.value);
                      setMovieFilter('');
                      setQuery('');
                      setConfirmation(null);
                    }}
                  >
                    {data.theatres.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.city}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          <div className="admin-controls">
            {!['screens', 'statistics'].includes(tab) && (
              <label className="admin-search">
                Search {tab}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by title, name, or reference…"
                />
              </label>
            )}
            {tab === 'shows' && (
              <label>
                Movie
                <select
                  value={movieFilter}
                  onChange={(e) => setMovieFilter(e.target.value)}
                >
                  <option value="">All movies at this theatre</option>
                  {theatreMovies.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {tab === 'shows' && (
              <label>
                Screenings
                <select
                  value={showScope}
                  onChange={(e) => setShowScope(e.target.value)}
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="all">All dates</option>
                  <option value="past">Past</option>
                </select>
              </label>
            )}
            {(superAdmin
              ? ['movies', 'shows', 'users', 'theatres']
              : ['shows']
            ).includes(tab) && (
              <button
                className="button"
                disabled={
                  busy ||
                  (tab === 'shows' &&
                    (!data.movies.some((m) => !m.archived) || !theatre))
                }
                onClick={() =>
                  setEditor({
                    type: tab,
                    theatreId: tab === 'shows' ? theatre.id : undefined,
                    movieId:
                      tab === 'shows' && movieFilter
                        ? Number(movieFilter)
                        : undefined,
                  })
                }
              >
                <Plus size={17} />
                Add{' '}
                {tab === 'movies'
                  ? 'movie'
                  : tab === 'shows'
                    ? 'screening'
                    : tab === 'theatres'
                      ? 'theatre'
                      : 'account'}
              </button>
            )}
          </div>
          {confirmation && (
            <div className="panel admin-confirm" role="alert">
              <h3>{confirmation.title}</h3>
              <p>{confirmation.explanation}</p>
              <div className="actions">
                <button
                  className="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await mutate(
                        confirmation.path,
                        confirmation.method,
                        confirmation.body,
                      );
                      setConfirmation(null);
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? 'Working…' : 'Confirm'}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setConfirmation(null)}
                >
                  Keep unchanged
                </button>
              </div>
            </div>
          )}
          {tab === 'screens' && theatre && (
            <ScreenManager
              key={theatre.id}
              theatre={theatre}
              screens={data.screens}
              onSave={mutate}
            />
          )}
          {tab === 'statistics' && (
            <TheatreStats data={data} theatre={theatre} />
          )}
          {tab === 'movies' && (
            <>
              <p className="muted small-text">
                This catalogue is shared by all theatres. Movie edits and
                archiving apply across all locations. Archive to hide a movie
                while keeping its history. Restoring a movie does not
                automatically reopen its screenings.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Movie</th>
                      <th>Details</th>
                      <th>Seat prices</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.movies
                      .filter((m) => matches(m.title, m.language, ...m.genre))
                      .map((m) => (
                        <tr key={m.id}>
                          <td>
                            <strong>{m.title}</strong>
                            <br />
                            <small>
                              #{m.id} · {m.releaseDate}
                            </small>
                          </td>
                          <td>
                            {m.language} · {m.duration}
                            <br />
                            <small>{m.genre.join(', ')}</small>
                          </td>
                          <td>
                            {money(m.price)}
                            <br />
                            <small>Premium +{money(m.premiumPrice)}</small>
                          </td>
                          <td>{m.archived ? 'Archived' : 'Published'}</td>
                          <td>
                            <div className="actions">
                              <button
                                className="button small secondary"
                                disabled={busy}
                                onClick={() =>
                                  setEditor({ type: 'movies', record: m })
                                }
                              >
                                Edit
                              </button>
                              <button
                                className="button small secondary"
                                disabled={busy}
                                onClick={() =>
                                  confirm(
                                    `${m.archived ? 'Restore' : 'Archive'} ${m.title}?`,
                                    m.archived
                                      ? 'Publish this movie again. Enable its screenings separately.'
                                      : 'Hide this movie and disable its screenings. Upcoming reservations must be cancelled first.',
                                    `/admin/movies/${m.id}`,
                                    'PATCH',
                                    { archived: !m.archived },
                                  )
                                }
                              >
                                {m.archived ? 'Restore' : 'Archive'}
                              </button>
                              <button
                                className="button small secondary"
                                disabled={
                                  busy ||
                                  data.shows.some((s) => s.movie_id === m.id)
                                }
                                title="Delete is available only after removing all associated screenings"
                                onClick={() =>
                                  confirm(
                                    `Delete ${m.title}?`,
                                    'Permanently remove this movie and its saved favourites.',
                                    `/admin/movies/${m.id}`,
                                    'DELETE',
                                  )
                                }
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!data.movies.some((m) =>
                matches(m.title, m.language, ...m.genre),
              ) && (
                <p className="empty">
                  No matching movies. Add a movie to get started.
                </p>
              )}
            </>
          )}
          {tab === 'programme' && theatre && (
            <>
              <p className="muted">
                Movies scheduled at this theatre. Add a screening to choose a
                movie from the catalogue and set its screen, date, and time.
              </p>
              <button
                className="button"
                disabled={busy || !data.movies.some((m) => !m.archived)}
                onClick={() =>
                  setEditor({ type: 'shows', theatreId: theatre.id })
                }
              >
                Add movie screening
              </button>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Movie</th>
                      <th>Screenings</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {theatreMovies
                      .filter((m) => matches(m.title, m.language))
                      .map((m) => (
                        <tr key={m.id}>
                          <td>
                            {m.title}
                            <br />
                            <small>
                              {m.language} · {m.duration}
                            </small>
                          </td>
                          <td>
                            {
                              theatreShows.filter((s) => s.movie_id === m.id)
                                .length
                            }
                          </td>
                          <td>
                            <div className="actions">
                              <button
                                className="button secondary small"
                                onClick={() => {
                                  setTab('shows');
                                  setQuery('');
                                  setMovieFilter(String(m.id));
                                  setShowScope('all');
                                }}
                              >
                                Manage timings
                              </button>
                              <button
                                className="button secondary small"
                                disabled={busy || m.archived}
                                onClick={() =>
                                  setEditor({
                                    type: 'shows',
                                    theatreId: theatre.id,
                                    movieId: m.id,
                                  })
                                }
                              >
                                Add screening
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!theatreMovies.length && (
                <p className="empty">
                  No movies scheduled here yet. Add a movie screening to get
                  started.
                </p>
              )}
            </>
          )}
          {tab === 'theatres' && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Theatre</th>
                    <th>Location</th>
                    <th>Screens</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.theatres
                    .filter((t) => matches(t.name, t.city, t.address))
                    .map((t) => (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td>
                          {t.city}
                          <br />
                          <small>{t.address}</small>
                        </td>
                        <td>
                          {[
                            ...new Set(
                              data.shows
                                .filter((s) => s.theatre_id === t.id)
                                .map((s) => s.screen),
                            ),
                          ].join(', ') || 'Add a screening to assign a screen'}
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="button small"
                              disabled={busy}
                              onClick={() => openTheatre(t.id)}
                            >
                              Manage movies & timings
                            </button>
                            {superAdmin && (
                              <>
                                <button
                                  className="button secondary small"
                                  disabled={busy}
                                  onClick={() =>
                                    setEditor({ type: 'theatres', record: t })
                                  }
                                >
                                  Edit
                                </button>
                                <button
                                  className="button secondary small"
                                  disabled={
                                    busy ||
                                    data.shows.some(
                                      (s) => s.theatre_id === t.id,
                                    )
                                  }
                                  onClick={() =>
                                    confirm(
                                      `Delete ${t.name}?`,
                                      'Permanently remove this theatre.',
                                      `/admin/theatres/${t.id}`,
                                      'DELETE',
                                    )
                                  }
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!data.theatres.length && (
                <p className="empty">
                  Add your first theatre, then create screenings.
                </p>
              )}
            </div>
          )}
          {tab === 'shows' && (
            <>
              <p className="muted small-text">
                All times are IST. Capacity uses the saved screen layout.
                Booking history prevents editing or deleting a screening.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Movie</th>
                      <th>Date & time (IST)</th>
                      <th>Screen</th>
                      <th>Seats</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {theatreShows
                      .filter(
                        (s) =>
                          !movieFilter || s.movie_id === Number(movieFilter),
                      )
                      .filter(
                        (s) =>
                          matches(
                            movieTitle(s.movie_id),
                            s.screen,
                            s.date,
                            s.theatre?.name,
                            s.theatre?.city,
                          ) &&
                          (showScope === 'all' ||
                            (showScope === 'past'
                              ? new Date(s.starts_at) <= new Date()
                              : new Date(s.starts_at) > new Date())),
                      )
                      .map((s) => (
                        <tr key={s.id}>
                          <td>{movieTitle(s.movie_id)}</td>
                          <td>
                            {dateLabel(s.date)}
                            <br />
                            <small>{s.time}</small>
                          </td>
                          <td>
                            {s.theatre?.name}
                            <br />
                            <small>
                              {s.theatre?.city} · Screen {s.screen}
                            </small>
                          </td>
                          <td>
                            {s.occupied} / {s.capacity}
                          </td>
                          <td>{s.active ? 'Open' : 'Disabled'}</td>
                          <td>
                            <div className="actions">
                              <button
                                className="button secondary small"
                                disabled={busy || s.booking_count > 0}
                                onClick={() =>
                                  setEditor({
                                    type: 'shows',
                                    record: s,
                                    theatreId: theatre.id,
                                  })
                                }
                              >
                                Edit
                              </button>
                              <button
                                className="button secondary small"
                                disabled={
                                  busy || (!!s.active && s.occupied > 0)
                                }
                                onClick={() =>
                                  confirm(
                                    `${s.active ? 'Disable' : 'Enable'} screening?`,
                                    `${movieTitle(s.movie_id)} · ${dateLabel(s.date)} · ${s.time} · Screen ${s.screen}`,
                                    `/admin/shows/${s.id}`,
                                    'PATCH',
                                    { active: !s.active },
                                  )
                                }
                              >
                                {s.active ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                className="button secondary small"
                                disabled={busy || s.booking_count > 0}
                                onClick={() =>
                                  confirm(
                                    'Delete screening?',
                                    'This removes the screening permanently. It will not be recreated automatically.',
                                    `/admin/shows/${s.id}`,
                                    'DELETE',
                                  )
                                }
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'bookings' && (
            <>
              <p className="muted small-text">
                Reservation history is retained. Cancellation releases seats;
                payment and refunds are not enabled.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Customer</th>
                      <th>Screening</th>
                      <th>Seats / total</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bookings
                      .filter((b) =>
                        matches(b.id, b.name, b.email, b.movie.title),
                      )
                      .map((b) => (
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
                              {b.theatre?.name} · {dateLabel(b.date)} · {b.time}{' '}
                              · Screen {b.screen}
                            </small>
                          </td>
                          <td>
                            {b.seats.join(', ')}
                            <br />
                            {money(b.total)}
                          </td>
                          <td>{b.status} · unpaid</td>
                          <td>
                            <button
                              className="button small secondary"
                              disabled={busy || b.status === 'cancelled'}
                              onClick={() =>
                                confirm(
                                  'Cancel reservation?',
                                  `Release seats ${b.seats.join(', ')} for ${b.name}. The reservation will remain in history.`,
                                  `/admin/bookings/${b.id}/cancel`,
                                  'POST',
                                )
                              }
                            >
                              Cancel reservation
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!data.bookings.length && (
                <p className="empty">No reservations yet.</p>
              )}
            </>
          )}
          {tab === 'users' && (
            <>
              <p className="muted small-text">
                Passwords and session tokens are never shown. Accounts with
                booking history cannot be deleted.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Reservations</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers
                      .filter((c) => matches(c.name, c.email, c.role))
                      .map((c) => (
                        <tr key={c.id}>
                          <td>
                            {c.name}
                            {c.id === user.id ? ' (you)' : ''}
                          </td>
                          <td>{c.email}</td>
                          <td>{c.role}</td>
                          <td>{c.booking_count}</td>
                          <td>
                            <div className="actions">
                              <button
                                className="button secondary small"
                                disabled={busy}
                                onClick={() =>
                                  setEditor({ type: 'users', record: c })
                                }
                              >
                                Edit
                              </button>
                              <button
                                className="button secondary small"
                                disabled={
                                  busy ||
                                  c.id === user.id ||
                                  c.booking_count > 0
                                }
                                onClick={() =>
                                  confirm(
                                    `Delete ${c.name}?`,
                                    'Permanently delete this account, its saved favourites, and login sessions.',
                                    `/admin/users/${c.id}`,
                                    'DELETE',
                                  )
                                }
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'audit' && (
            <>
              <p className="muted small-text">
                The latest 100 management actions. All activity is stored in the
                database.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>When (IST)</th>
                      <th>Administrator</th>
                      <th>Action</th>
                      <th>Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit
                      .filter((a) => matches(a.actor, a.action, a.entity_id))
                      .map((a) => (
                        <tr key={a.id}>
                          <td>
                            {new Date(a.created_at).toLocaleString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                            })}
                          </td>
                          <td>{a.actor || 'Deleted account'}</td>
                          <td>{a.action}</td>
                          <td>{a.entity_id}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!data.audit.length && (
                <p className="empty">No management changes yet.</p>
              )}
            </>
          )}
          {editor && (
            <AdminEditor
              editor={editor}
              movies={data.movies}
              theatres={data.theatres}
              screens={data.screens}
              onClose={() => setEditor(null)}
              onSave={async (value) => {
                await mutate(
                  `/admin/${editor.type}${editor.record ? `/${editor.record.id}` : ''}`,
                  editor.record ? 'PUT' : 'POST',
                  value,
                );
                setEditor(null);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
