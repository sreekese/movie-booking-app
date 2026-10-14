import PosterImage from '../components/PosterImage';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Star, Heart, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import CatalogueState from '../components/CatalogueState';
import { api, dateLabel, money } from '../api';
import { useApp } from '../context';
export default function MovieDetails() {
  const { id } = useParams();
  const { movies, catalogueLoading, catalogueError } = useApp();
  const movie = movies.find((m) => m.id === Number(id));
  const { user, ready, favourites, favouritesLoading, toggleFavourite } =
    useApp();
  const [shows, setShows] = useState([]);
  const [date, setDate] = useState('');
  const [params, setParams] = useSearchParams();
  const theatre = params.get('theatre') || '';
  const setTheatre = (value) => setParams(value ? { theatre: value } : {});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    api(`/shows?movie=${id}`)
      .then((data) => {
        if (current) {
          setShows(data);
          setDate(data[0]?.date || '');
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [id]);
  if (catalogueLoading || catalogueError) return <CatalogueState />;
  if (!movie)
    return (
      <section className="container page empty">
        <h1>Movie not found</h1>
        <Link to="/movies" className="button">
          Browse movies
        </Link>
      </section>
    );
  const saved = favourites.includes(movie.id);
  const selectedShows = shows.filter(
    (s) => !theatre || s.theatre_id === Number(theatre),
  );
  const selectedDate = selectedShows.some((s) => s.date === date)
    ? date
    : selectedShows[0]?.date;
  const venues = [
    ...new Map(
      selectedShows
        .filter((s) => s.date === selectedDate)
        .map((s) => [s.theatre_id, s.theatre]),
    ).values(),
  ];
  return (
    <section className="container page">
      <Link className="back-link" to="/movies">
        ← All movies
      </Link>
      <div className="movie-detail">
        <PosterImage
          className="detail-poster"
          src={movie.poster}
          alt={movie.title}
        />
        <div>
          <p className="eyebrow accent">THE CLASSICS COLLECTION</p>
          <h1>{movie.title}</h1>
          <p className="movie-meta">
            <span className="accent">
              <Star size={18} fill="currentColor" /> {movie.rating} / 10
            </span>{' '}
            {movie.certificate} · {movie.duration} · {movie.language}
          </p>
          <p className="muted">
            {movie.genre.join(' / ')} · Released {movie.releaseDate.slice(0, 4)}
          </p>
          <p className="synopsis">{movie.description}</p>
          <div className="actions">
            {movie.trailer && (
              <a
                className="button secondary"
                href={movie.trailer}
                target="_blank"
                rel="noreferrer"
              >
                Watch trailer <ExternalLink size={16} />
              </a>
            )}
            <button
              className="button secondary"
              aria-pressed={saved}
              disabled={!ready || favouritesLoading}
              onClick={async () => {
                if (!user) return toast.error('Sign in to save favourites.');
                try {
                  await toggleFavourite(movie.id);
                } catch (e) {
                  toast.error(e.message);
                }
              }}
            >
              <Heart size={17} fill={saved ? 'currentColor' : 'none'} />
              {saved ? 'Saved' : 'Save movie'}
            </button>
          </div>
          <p className="muted">
            Classic seats from {money(movie.price)} · Premium +
            {money(movie.premiumPrice)}
          </p>
        </div>
      </div>
      <div className="panel show-picker">
        <p className="eyebrow accent">PLAN YOUR VISIT</p>
        <h2>Pick your show</h2>
        <p className="muted">
          Choose a theatre and screening · 2D · All times IST
        </p>
        {loading && (
          <LoadingSkeleton variant="shows" label="Loading screenings…" />
        )}
        {error && (
          <p role="alert" className="error">
            {error}{' '}
            <button onClick={() => window.location.reload()}>Retry</button>
          </p>
        )}
        {!!selectedShows.length && (
          <label>
            Theatre
            <select
              value={theatre}
              onChange={(e) => {
                setTheatre(e.target.value);
                setDate(
                  shows.find(
                    (s) =>
                      !e.target.value ||
                      s.theatre_id === Number(e.target.value),
                  )?.date || '',
                );
              }}
            >
              <option value="">All theatres</option>
              {theatre &&
                !shows.some((s) => s.theatre_id === Number(theatre)) && (
                  <option value={theatre}>
                    Selected theatre · no upcoming screenings
                  </option>
                )}
              {[
                ...new Map(
                  shows.map((s) => [s.theatre_id, s.theatre]),
                ).values(),
              ].map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.city}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="chips dates">
          {[
            ...new Set(
              shows
                .filter((s) => !theatre || s.theatre_id === Number(theatre))
                .map((s) => s.date),
            ),
          ].map((d) => (
            <button
              className={`chip ${selectedDate === d ? 'selected' : ''}`}
              key={d}
              onClick={() => setDate(d)}
              aria-pressed={selectedDate === d}
            >
              {dateLabel(d)}
            </button>
          ))}
        </div>
        {venues.map((t) => (
          <section className="theatre-show-group" key={t.id}>
            <h3>{t.name}</h3>
            <p className="muted">
              {t.city} · {t.address}
            </p>
            <div className="chips">
              {selectedShows
                .filter((s) => s.theatre_id === t.id && s.date === selectedDate)
                .map((s) => (
                  <Link
                    key={s.id}
                    className="show-time"
                    to={`/movies/${movie.id}/${s.id}`}
                  >
                    {s.time}
                    <small>Screen {s.screen} · 2D</small>
                  </Link>
                ))}
            </div>
          </section>
        ))}
        {!loading && !error && !selectedShows.length && (
          <p>No upcoming screenings are available.</p>
        )}
      </div>
    </section>
  );
}
