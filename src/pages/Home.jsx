import { Link } from 'react-router-dom';
import { ArrowRight, Ticket, Armchair, CalendarDays } from 'lucide-react';
import movies from '../data/data';
import MovieCard from '../components/MovieCard';
export default function Home() {
  const movie = movies[0];
  return (
    <>
      <section
        className="hero"
        style={{
          backgroundImage: `linear-gradient(90deg, #090d16 5%, #090d16b8 50%, #090d1630), linear-gradient(0deg, #090d16, transparent 65%), url(${movie.banner})`,
        }}
      >
        <div className="hero-content">
          <p className="eyebrow accent">THE BIG SCREEN IS CALLING</p>
          <span className="pill">The classics, back in cinemas</span>
          <h1>
            Some stories deserve
            <br />a bigger screen.
          </h1>
          <p className="hero-title">{movie.title}</p>
          <p className="muted">
            {movie.genre.join(' · ')} <span className="dot">•</span>{' '}
            {movie.duration} <span className="dot">•</span> {movie.certificate}
          </p>
          <p className="hero-description">
            Assemble your people. Pick your seats. Rediscover the films you
            love, the way they were meant to be seen.
          </p>
          <div className="actions">
            <Link className="button" to={`/movies/${movie.id}`}>
              Book your experience <ArrowRight size={18} />
            </Link>
            <Link className="button secondary" to="/movies">
              Explore movies
            </Link>
          </div>
        </div>
        <div className="hero-caption">
          <span className="accent">01 / 05</span> &nbsp; SPOTLIGHT COLLECTION
        </div>
      </section>
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
          <p>Seven days of screenings, with times that fit your plans.</p>
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
