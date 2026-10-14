import LoadingSkeleton from './LoadingSkeleton';
import { useApp } from '../context';
export default function CatalogueState() {
  const { catalogueError, reloadCatalogue } = useApp();
  return (
    <section className="container page">
      {catalogueError ? (
        <div className="error" role="alert">
          <p>{catalogueError}</p>
          <button className="button secondary" onClick={reloadCatalogue}>
            Retry movies
          </button>
        </div>
      ) : (
        <LoadingSkeleton variant="movies" label="Loading movies…" />
      )}
    </section>
  );
}
