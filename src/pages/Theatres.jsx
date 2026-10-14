import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import LoadingSkeleton from '../components/LoadingSkeleton';
export default function Theatres() {
  const [theatres, setTheatres] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    api('/theatres')
      .then((data) => {
        if (current) setTheatres(data);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, []);
  return (
    <section className="container page">
      <p className="eyebrow accent">PLAN YOUR VISIT</p>
      <h1>Our theatres</h1>
      <p className="muted">
        Choose a movie to see available screenings at each location. All
        showtimes are in IST.
      </p>
      {error ? (
        <p role="alert" className="error">
          {error}{' '}
          <button onClick={() => window.location.reload()}>Retry</button>
        </p>
      ) : !theatres ? (
        <LoadingSkeleton />
      ) : theatres.length ? (
        theatres.map((t) => (
          <article className="panel" key={t.id}>
            <h2>{t.name}</h2>
            <p>{t.city}</p>
            <p className="muted">{t.address}</p>
            <Link className="button secondary" to={`/movies?theatre=${t.id}`}>
              View movies & showtimes
            </Link>
          </article>
        ))
      ) : (
        <p>No theatres have been added yet.</p>
      )}
    </section>
  );
}
