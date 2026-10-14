function Block({ className = '' }) {
  return <div className={`shimmer ${className}`} />;
}
export default function LoadingSkeleton({
  variant = 'page',
  label = 'Loading content…',
}) {
  let content;
  switch (variant) {
    case 'account':
      content = <Block className="skeleton-button" />;
      break;
    case 'movies':
      content = (
        <div className="movie-grid">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i}>
              <Block className="skeleton-poster" />
              <Block className="skeleton-line" />
              <Block className="skeleton-line short" />
            </div>
          ))}
        </div>
      );
      break;
    case 'shows':
      content = (
        <>
          <div className="chips dates">
            {Array.from({ length: 7 }, (_, i) => (
              <Block key={i} className="skeleton-button" />
            ))}
          </div>
          <div className="chips">
            {Array.from({ length: 4 }, (_, i) => (
              <Block key={i} className="skeleton-show" />
            ))}
          </div>
        </>
      );
      break;
    case 'bookings':
      content = (
        <>
          {Array.from({ length: 2 }, (_, i) => (
            <div className="panel reservation" key={i}>
              <Block className="skeleton-ticket-poster" />
              <div className="reservation-details">
                <Block className="skeleton-line short" />
                <Block className="skeleton-heading" />
                <Block className="skeleton-line" />
                <Block className="skeleton-line short" />
              </div>
              <Block className="skeleton-button" />
            </div>
          ))}
        </>
      );
      break;
    case 'seats':
      content = (
        <>
          <Block className="skeleton-heading" />
          <div className="booking-layout">
            <div className="panel">
              <Block className="skeleton-screen" />
              <div className="skeleton-seats">
                {Array.from({ length: 96 }, (_, i) => (
                  <Block key={i} className="skeleton-seat" />
                ))}
              </div>
            </div>
            <div className="panel">
              <Block className="skeleton-heading" />
              <Block className="skeleton-line" />
              <Block className="skeleton-line short" />
              <Block className="skeleton-summary" />
              <Block className="skeleton-button" />
            </div>
          </div>
        </>
      );
      break;
    case 'admin':
      content = (
        <>
          <div className="stats">
            {Array.from({ length: 3 }, (_, i) => (
              <div className="panel" key={i}>
                <Block className="skeleton-line" />
                <Block className="skeleton-heading" />
              </div>
            ))}
          </div>
          <div className="panel">
            {Array.from({ length: 6 }, (_, i) => (
              <Block className="skeleton-table-row" key={i} />
            ))}
          </div>
        </>
      );
      break;
    default:
      content = (
        <>
          <Block className="skeleton-heading" />
          <Block className="skeleton-line short" />
          <Block className="skeleton-summary" />
        </>
      );
  }
  return (
    <div className="loading-skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{content}</div>
    </div>
  );
}
