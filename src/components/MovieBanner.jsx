import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function MovieBanner({ movies }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const activeIndex = index % movies.length;
  const movie = movies[activeIndex];

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (event) => setPaused(event.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (paused || hovered || focused || movies.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden)
        setIndex((current) => (current + 1) % movies.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [paused, hovered, focused, movies.length, index]);

  return (
    <section
      className="hero"
      aria-label="Movie spotlight"
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
      style={{
        backgroundImage: `linear-gradient(90deg, #090d16 5%, #090d16b8 50%, #090d1630), linear-gradient(0deg, #090d16, transparent 65%), url(${JSON.stringify(movie.banner || movie.poster)})`,
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
          Assemble your people. Pick your seats. Rediscover the films you love,
          the way they were meant to be seen.
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
        <span className="accent">
          {String(activeIndex + 1).padStart(2, '0')} /{' '}
          {String(movies.length).padStart(2, '0')}
        </span>{' '}
        <span>SPOTLIGHT COLLECTION</span>
      </div>
    </section>
  );
}
