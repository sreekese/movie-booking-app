import { useApp } from '../context';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import CatalogueState from '../components/CatalogueState';
import MovieCard from '../components/MovieCard';
export default function Movies() {
  const { movies, catalogueLoading, catalogueError } = useApp();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const theatreId = params.get('theatre') || '';
  const theatres = [
    ...new Map(
      movies.flatMap((m) => m.theatres || []).map((t) => [t.id, t]),
    ).values(),
  ];
  const [genre, setGenre] = useState('All');
  const [sort, setSort] = useState('rating');
  const filtered = movies
    .filter(
      (m) =>
        m.title.toLowerCase().includes(query.toLowerCase()) &&
        (genre === 'All' || m.genre.includes(genre)) &&
        (!theatreId || m.theatres?.some((t) => t.id === Number(theatreId))),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'price'
          ? a.price - b.price
          : b.rating - a.rating,
    );
  if (catalogueLoading || catalogueError) return <CatalogueState />;
  return (
    <section className="container page">
      <p className="eyebrow accent">FIND YOUR NEXT FAVOURITE</p>
      <h1>On the big screen</h1>
      <p className="muted">
        A handpicked collection of stories worth watching again.
      </p>
      <div className="filters">
        <label className="search-field">
          <Search size={20} />
          <input
            aria-label="Search movies"
            placeholder="Search for a movie…"
            value={query}
            onChange={(e) =>
              setParams(
                (previous) => {
                  const next = new URLSearchParams(previous);
                  if (e.target.value) next.set('q', e.target.value);
                  else next.delete('q');
                  return next;
                },
                { replace: true },
              )
            }
          />
        </label>
        <label>
          Theatre
          <select
            value={theatreId}
            onChange={(e) =>
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                if (e.target.value) next.set('theatre', e.target.value);
                else next.delete('theatre');
                return next;
              })
            }
          >
            <option value="">All theatres</option>
            {theatreId && !theatres.some((t) => t.id === Number(theatreId)) && (
              <option value={theatreId}>
                Selected theatre · no upcoming movies
              </option>
            )}
            {theatres.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.city}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="rating">Highest rated</option>
            <option value="price">Lowest price</option>
            <option value="title">Title A–Z</option>
          </select>
        </label>
      </div>
      <div className="chips" aria-label="Filter by genre">
        {['All', ...new Set(movies.flatMap((m) => m.genre))].map((g) => (
          <button
            key={g}
            className={genre === g ? 'chip selected' : 'chip'}
            aria-pressed={genre === g}
            onClick={() => setGenre(g)}
          >
            {g}
          </button>
        ))}
      </div>
      <p className="muted result-count" role="status">
        {filtered.length} movies
      </p>
      <div className="movie-grid">
        {filtered.map((movie) => (
          <MovieCard key={movie.id} movie={movie} theatreId={theatreId} />
        ))}
      </div>
      {!filtered.length && (
        <div className="empty">
          <h2>No matching movies</h2>
          <p>Try another title or genre.</p>
          <button
            className="button"
            onClick={() => {
              setParams({});
              setGenre('All');
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}
