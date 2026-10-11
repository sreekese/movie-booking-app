import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Star, Heart, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import movies from '../data/data';
import { api, dateLabel, money } from '../api';
import { useApp } from '../context';
const trailers = [
  'TcMBFSGVi1c',
  'JfVOs4VSpmA',
  'EXeTwQWrcwY',
  'zSWdZVtXT7E',
  'zAGVQLHvwOY',
];
export default function MovieDetails() {
  const { id } = useParams();
  const movie = movies.find((m) => m.id === Number(id));
  const { user, favourites, toggleFavourite } = useApp();
  const [shows, setShows] = useState([]);
  const [date, setDate] = useState('');
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
  return (
    <section className="container page">
      <Link className="back-link" to="/movies">
        ← All movies
      </Link>
      <div className="movie-detail">
        <img className="detail-poster" src={movie.poster} alt={movie.title} />
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
            <a
              className="button secondary"
              href={`https://www.youtube.com/watch?v=${trailers[movie.id - 1]}`}
              target="_blank"
              rel="noreferrer"
            >
              Watch trailer <ExternalLink size={16} />
            </a>
            <button
              className="button secondary"
              aria-pressed={saved}
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
            Classic seats from {money(movie.price)} · Premium +{money(60)}
          </p>
        </div>
      </div>
      <div className="panel show-picker">
        <p className="eyebrow accent">PLAN YOUR VISIT</p>
        <h2>Pick your show</h2>
        <p className="muted">
          Quick Show Cinema · Screen {movie.id} · 2D · All times IST
        </p>
        {loading && <p role="status">Loading screenings…</p>}
        {error && (
          <p role="alert" className="error">
            {error}{' '}
            <button onClick={() => window.location.reload()}>Retry</button>
          </p>
        )}
        <div className="chips dates">
          {[...new Set(shows.map((s) => s.date))].map((d) => (
            <button
              className={`chip ${date === d ? 'selected' : ''}`}
              key={d}
              onClick={() => setDate(d)}
              aria-pressed={date === d}
            >
              {dateLabel(d)}
            </button>
          ))}
        </div>
        <div className="chips">
          {shows
            .filter((s) => s.date === date)
            .map((s) => (
              <Link
                key={s.id}
                className="show-time"
                to={`/movies/${movie.id}/${s.id}`}
              >
                {s.time}
                <small>2D · Choose seats</small>
              </Link>
            ))}
        </div>
        {!loading && !error && !shows.length && (
          <p>No upcoming screenings are available.</p>
        )}
      </div>
    </section>
  );
}
