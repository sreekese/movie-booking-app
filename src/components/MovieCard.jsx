import { Link } from 'react-router-dom';
import { Heart, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context';
import { money } from '../api';
export default function MovieCard({ movie }) {
  const { user, favourites, toggleFavourite } = useApp();
  const saved = favourites.includes(movie.id);
  return (
    <article className="movie-card">
      <Link to={`/movies/${movie.id}`} className="poster-link">
        <img
          src={movie.poster}
          alt={`${movie.title} poster`}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
        <span className="poster-fallback">{movie.title}</span>
        <span className="rating">
          <Star size={14} fill="currentColor" /> {movie.rating.toFixed(1)}
        </span>
      </Link>
      <button
        className={`save-button ${saved ? 'saved' : ''}`}
        aria-label={`${saved ? 'Remove' : 'Save'} ${movie.title}`}
        aria-pressed={saved}
        onClick={async () => {
          if (!user) return toast.error('Sign in to save your favourites.');
          try {
            await toggleFavourite(movie.id);
          } catch (e) {
            toast.error(e.message);
          }
        }}
      >
        <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
      </button>
      <div className="movie-info">
        <p className="eyebrow">
          {movie.certificate} · {movie.language} · {movie.duration}
        </p>
        <h3>
          <Link to={`/movies/${movie.id}`}>{movie.title}</Link>
        </h3>
        <p className="muted">{movie.genre.join(' / ')}</p>
        <div className="card-bottom">
          <span>
            From <strong>{money(movie.price)}</strong>
          </span>
          <Link to={`/movies/${movie.id}`} className="text-link">
            Book seats ↗
          </Link>
        </div>
      </div>
    </article>
  );
}
