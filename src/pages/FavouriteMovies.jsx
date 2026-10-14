import LoadingSkeleton from '../components/LoadingSkeleton';
import { Link } from 'react-router-dom';
import { useApp } from '../context';
import CatalogueState from '../components/CatalogueState';
import MovieCard from '../components/MovieCard';
export default function FavouriteMovies() {
  const {
    movies,
    catalogueLoading,
    catalogueError,
    favourites,
    favouritesLoading,
  } = useApp();
  if (catalogueLoading || catalogueError) return <CatalogueState />;
  const savedMovies = movies.filter((m) => favourites.includes(m.id));
  return (
    <section className="container page">
      <p className="eyebrow accent">YOUR PERSONAL SHORTLIST</p>
      <h1>Saved for movie night</h1>
      {favouritesLoading && (
        <LoadingSkeleton variant="movies" label="Loading favourites…" />
      )}
      <div className="movie-grid">
        {savedMovies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}
      </div>
      {!favouritesLoading && !savedMovies.length && (
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
