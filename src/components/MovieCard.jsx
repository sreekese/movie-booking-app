import PosterImage from './PosterImage';
import { Link } from 'react-router-dom';
import { Heart, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context';
import { money } from '../api';
export default function MovieCard({ movie, theatreId = '' }) {
  const { user, ready, favourites, favouritesLoading, toggleFavourite } =
    useApp();
  const movieUrl = `/movies/${movie.id}${theatreId ? `?theatre=${theatreId}` : ''}`;
  const saved = favourites.includes(movie.id);
  return (
    <article className="movie-card">
      <Link to={movieUrl} className="poster-link">
        <PosterImage
          src={movie.poster}
          alt={`${movie.title} poster`}
          loading="lazy"
        />
        <span className="rating">
          <Star size={14} fill="currentColor" /> {movie.rating.toFixed(1)}
        </span>
      </Link>
      <button
        className={`save-button ${saved ? 'saved' : ''}`}
        aria-label={`${saved ? 'Remove' : 'Save'} ${movie.title}`}
        aria-pressed={saved}
        disabled={!ready || favouritesLoading}
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
          <Link to={movieUrl}>{movie.title}</Link>
        </h3>
        <p className="muted">{movie.genre.join(' / ')}</p>
        <div className="card-bottom">
          <span>
            From <strong>{money(movie.price)}</strong>
          </span>
          <Link to={movieUrl} className="text-link">
            Book seats ↗
          </Link>
        </div>
      </div>
    </article>
  );
}
