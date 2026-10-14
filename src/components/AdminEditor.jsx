import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
const blankMovie = {
  title: '',
  genre: [],
  language: 'English',
  duration: '2h 0m',
  rating: 0,
  releaseDate: '',
  certificate: 'UA',
  price: 200,
  premiumPrice: 60,
  poster: '',
  banner: '',
  trailer: '',
  description: '',
};
function Field({ label, name, value, type = 'text', ...props }) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value ?? ''}
        required
        {...props}
      />
    </label>
  );
}
export default function AdminEditor({
  editor,
  movies,
  theatres,
  screens,
  onSave,
  onClose,
}) {
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { type, record } = editor;
  const [role, setRole] = useState(record?.role || 'customer');
  const data = record || (type === 'movies' ? blankMovie : {});
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    let value = fields;
    if (type === 'movies')
      value = {
        ...fields,
        genre: fields.genre
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        price: Number(fields.price),
        premiumPrice: Number(fields.premiumPrice),
        rating: Number(fields.rating),
      };
    if (type === 'shows')
      value = {
        ...fields,
        movie_id: Number(fields.movie_id),
        theatre_id: Number(fields.theatre_id),
        active: fields.active === 'on',
      };
    if (type === 'users')
      value = {
        ...value,
        theatre_ids: new FormData(event.currentTarget)
          .getAll('theatre_ids')
          .map(Number),
      };
    try {
      await onSave(value);
    } catch (error) {
      setError(error.message);
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="admin-dialog"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      aria-labelledby="editor-title"
    >
      <div className="section-heading">
        <h2 id="editor-title">
          {record ? 'Edit' : 'Add'}{' '}
          {type === 'movies'
            ? 'movie'
            : type === 'shows'
              ? 'screening'
              : type === 'theatres'
                ? 'theatre'
                : 'account'}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close editor"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="admin-fields">
          {type === 'movies' && (
            <>
              <Field
                label="Movie title"
                name="title"
                value={data.title}
                maxLength={120}
              />
              <Field
                label="Genres (comma-separated)"
                name="genre"
                value={data.genre.join(', ')}
                maxLength={180}
              />
              <Field
                label="Language"
                name="language"
                value={data.language}
                maxLength={40}
              />
              <Field
                label="Duration (e.g. 2h 30m)"
                name="duration"
                value={data.duration}
                maxLength={12}
              />
              <Field
                label="Rating (0–10)"
                name="rating"
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={data.rating}
              />
              <Field
                label="Release date"
                name="releaseDate"
                type="date"
                value={data.releaseDate}
              />
              <Field
                label="Certificate"
                name="certificate"
                value={data.certificate}
                maxLength={12}
              />
              <Field
                label="Classic seat price (INR)"
                name="price"
                type="number"
                min="1"
                max="10000"
                value={data.price}
              />
              <Field
                label="Premium surcharge (INR)"
                name="premiumPrice"
                type="number"
                min="0"
                max="10000"
                value={data.premiumPrice}
              />
              <Field
                label="Poster image URL (HTTPS)"
                name="poster"
                type="url"
                value={data.poster}
                maxLength={2000}
              />
              <Field
                label="Banner image URL (HTTPS)"
                name="banner"
                type="url"
                value={data.banner}
                maxLength={2000}
              />
              <Field
                label="Trailer URL (optional, HTTPS)"
                name="trailer"
                type="url"
                value={data.trailer}
                required={false}
                maxLength={2000}
              />
              <label className="wide">
                Description
                <textarea
                  name="description"
                  required
                  maxLength={3000}
                  rows={4}
                  defaultValue={data.description}
                />
              </label>
              <p className="muted small-text wide">
                Edits update the public catalogue. Existing reservation
                summaries keep their original movie details and prices. Duration
                changes require removing upcoming screenings first.
              </p>
            </>
          )}
          {type === 'theatres' && (
            <>
              <Field
                label="Theatre name"
                name="name"
                value={data.name}
                maxLength={80}
              />
              <Field
                label="City"
                name="city"
                value={data.city}
                maxLength={80}
              />
              <Field
                label="Full address"
                name="address"
                value={data.address}
                maxLength={240}
              />
            </>
          )}
          {type === 'shows' && (
            <>
              <label>
                Movie
                <select
                  name="movie_id"
                  defaultValue={
                    data.movie_id ||
                    editor.movieId ||
                    movies.find((m) => !m.archived)?.id
                  }
                  required
                >
                  {movies
                    .filter((m) => !m.archived || m.id === data.movie_id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                        {m.archived ? ' (archived — restore first)' : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Theatre
                <select
                  name="theatre_id"
                  defaultValue={
                    editor.theatreId || data.theatre_id || theatres[0]?.id
                  }
                  required
                >
                  {theatres
                    .filter(
                      (t) => !editor.theatreId || t.id === editor.theatreId,
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.city}
                      </option>
                    ))}
                </select>
              </label>
              <Field
                label="Screen name / number"
                name="screen"
                value={data.screen || '1'}
                maxLength={30}
                list="screen-names"
              />
              <datalist id="screen-names">
                {screens
                  .filter(
                    (s) =>
                      s.theatre_id ===
                      (editor.theatreId || data.theatre_id || theatres[0]?.id),
                  )
                  .map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
              </datalist>
              <p className="muted small-text">
                Choose a configured screen name. A new name starts with the
                standard 96-seat layout; customize it under Screens & seating
                before scheduling.
              </p>
              <Field
                label="Screening date (IST)"
                name="date"
                type="date"
                value={data.date}
              />
              <Field
                label="Screening time (IST)"
                name="time"
                type="time"
                value={
                  data.starts_at
                    ? new Date(Date.parse(data.starts_at) + 330 * 60000)
                        .toISOString()
                        .slice(11, 16)
                    : ''
                }
              />
              <label className="checkbox-label">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={record ? !!data.active : true}
                />
                Open for reservations
              </label>
              <p className="muted small-text wide">
                Screenings use the latest layout version when saved. Screenings
                cannot overlap on the same screen, including a 15-minute
                turnaround. Screenings with booking history cannot be edited.
              </p>
            </>
          )}
          {type === 'users' && (
            <>
              <Field
                label="Name"
                name="name"
                value={data.name}
                minLength={2}
                maxLength={80}
              />
              <Field
                label="Email"
                name="email"
                type="email"
                value={data.email}
                maxLength={254}
              />
              <label>
                Role
                <select
                  name="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="customer">Customer</option>
                  <option value="admin">Super administrator</option>
                  <option value="theatre_admin">Theatre administrator</option>
                </select>
              </label>
              {role === 'theatre_admin' && (
                <label className="wide">
                  Assigned theatres
                  <select
                    name="theatre_ids"
                    multiple
                    required
                    defaultValue={(data.theatre_ids || []).map(String)}
                  >
                    {theatres.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.city}
                      </option>
                    ))}
                  </select>
                  <small>Use Ctrl / Cmd to select multiple theatres.</small>
                </label>
              )}
              {!record && (
                <Field
                  label="Initial password"
                  name="password"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                />
              )}
              <p className="muted small-text wide">
                Role changes end the account’s active sessions. Your own
                administrator access cannot be removed here.
              </p>
            </>
          )}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
