import { useApp } from '../context';
import { Link } from 'react-router-dom';
import { ArrowRight, Ticket, Armchair, CalendarDays } from 'lucide-react';
import CatalogueState from '../components/CatalogueState';
import MovieCard from '../components/MovieCard';
import MovieBanner from '../components/MovieBanner';
export default function Home() {
  const { movies, catalogueLoading, catalogueError } = useApp();
  const movie = movies[0];
  if (catalogueLoading || catalogueError) return <CatalogueState />;
  if (!movie)
    return (
      <section className="container page empty">
        <h1>New stories are on their way.</h1>
        <p>No movies are currently published. Check back soon.</p>
      </section>
    );
  return (
    <>
      <MovieBanner movies={movies} />
      <section className="container section">
        <div className="section-heading">
          <div>
            <p className="eyebrow accent">LIGHTS DOWN. WORLD OFF.</p>
            <h2>Now showing</h2>
          </div>
          <Link className="text-link" to="/movies">
            All movies <ArrowRight size={17} />
          </Link>
        </div>
        <div className="movie-grid">
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      </section>
      <section className="container experience">
        <div>
          <p className="eyebrow accent">YOUR NIGHT, SORTED</p>
          <h2>
            From “what’s on?”
            <br />
            to “see you there.”
          </h2>
        </div>
        <div className="experience-item">
          <CalendarDays />
          <h3>Find your moment</h3>
          <p>Choose from the screenings in our current programme.</p>
        </div>
        <div className="experience-item">
          <Armchair />
          <h3>Make yourself comfortable</h3>
          <p>Choose a classic seat or stretch out in our premium rows.</p>
        </div>
        <div className="experience-item">
          <Ticket />
          <h3>Keep it all together</h3>
          <p>
            Find your reservation details in one place, whenever you need them.
          </p>
        </div>
      </section>
      <section className="container notice">
        Development preview: screenings are a sample programme. Reservations are
        unpaid and are not valid admission tickets.
      </section>
    </>
  );
}
