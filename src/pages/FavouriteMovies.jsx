import { Link } from 'react-router-dom';
import { useApp } from '../context';
import movies from '../data/data';
import MovieCard from '../components/MovieCard';
export default function FavouriteMovies() {
  const { favourites } = useApp();
  return (
    <section className="container page">
      <p className="eyebrow accent">YOUR PERSONAL SHORTLIST</p>
      <h1>Saved for movie night</h1>
      <div className="movie-grid">
        {movies
          .filter((m) => favourites.includes(m.id))
          .map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
      </div>
      {!favourites.length && (
        <div className="empty">
          <h2>Your favourites start here</h2>
          <p>Tap the heart on a movie to keep it close.</p>
          <Link className="button" to="/movies">
            Discover movies
          </Link>
        </div>
      )}
    </section>
  );
}
