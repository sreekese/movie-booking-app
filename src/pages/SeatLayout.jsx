import { seatCategory, seatPrice, sameSeatGroup } from '../utils/seatCategory';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, dateLabel, money } from '../api';
export default function SeatLayout() {
  const { id, date: showId } = useParams();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    let current = true;
    const load = () =>
      api(`/shows/${showId}`)
        .then((data) => {
          if (current) {
            if (String(data.movie.id) !== id) {
              setError('This screening does not belong to this movie.');
              return;
            }
            setShow(data);
            setSelected((previous) =>
              previous.filter(
                (s) =>
                  !data.occupied.includes(s) &&
                  !data.layout.blocked.includes(s) &&
                  data.layout.rows.some(
                    (r) => s[0] === r.label && Number(s.slice(1)) <= r.count,
                  ),
              ),
            );
          }
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    load();
    const timer = setInterval(load, 15000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [showId, id]);
  const reserve = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const booking = await api('/bookings', {
        method: 'POST',
        body: {
          showId,
          seats: selected,
          expectedTotal: total,
          expectedLayoutVersion: show.layout_version,
        },
      });
      navigate(`/my-bookings?reservation=${booking.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      if (e.status === 409) {
        try {
          const updated = await api(`/shows/${showId}`);
          setShow(updated);
          setSelected((s) =>
            s.filter(
              (x) =>
                !updated.occupied.includes(x) &&
                !updated.layout.blocked.includes(x) &&
                updated.layout.rows.some(
                  (r) => x[0] === r.label && Number(x.slice(1)) <= r.count,
                ),
            ),
          );
        } catch {
          /* Keep the original conflict visible. */
        }
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  if (!show)
    return (
      <section className="container page">
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <LoadingSkeleton variant="seats" label="Loading seat availability…" />
        )}
        <Link to={`/movies/${id}`} className="text-link">
          Back to screenings
        </Link>
      </section>
    );
  const total = selected.reduce(
    (sum, seat) =>
      sum +
      seatPrice(
        show.layout.rows.find((r) => r.label === seat[0]),
        show.movie,
      ),
    0,
  );
  return (
    <section className="container page">
      <Link to={`/movies/${id}`} className="back-link">
        ← Change screening
      </Link>
      <p className="eyebrow accent">MAKE YOURSELF COMFORTABLE</p>
      <h1>Choose your seats</h1>
      <p className="muted">
        {show.movie.title} · {dateLabel(show.date)} · {show.time} IST · Screen{' '}
        {show.screen}
      </p>
      <div className="booking-layout">
        <div className="panel seat-panel">
          {show.layout.position !== 'back' && (
            <div className="screen">SCREEN THIS WAY</div>
          )}
          <div className="seat-scroll">
            <div className="seat-map">
              {show.layout.rows.map((row, rowIndex) => (
                <div key={row.label}>
                  {!sameSeatGroup(
                    show.layout.rows[rowIndex - 1],
                    row,
                    show.movie,
                  ) && (
                    <p className="seat-tier">
                      {seatCategory(row)} · {money(seatPrice(row, show.movie))}
                    </p>
                  )}
                  <div
                    className="seat-row"
                    style={{ paddingBottom: row.gapAfter ?? 0 }}
                  >
                    <span>{row.label}</span>
                    {Array.from({ length: row.count }, (_, index) => {
                      const seat = `${row.label}${index + 1}`;
                      const occupied =
                        show.occupied.includes(seat) ||
                        show.layout.blocked.includes(seat);
                      const accessible = show.layout.accessible.includes(seat);
                      return (
                        <button
                          type="button"
                          key={seat}
                          disabled={occupied || busy}
                          aria-label={`Seat ${seat}${accessible ? ', accessible' : ''}, ${occupied ? 'unavailable' : selected.includes(seat) ? 'selected' : 'available'}`}
                          aria-pressed={selected.includes(seat)}
                          className={`seat ${(row.aisles ?? (row.aisle ? [row.aisle] : [])).includes(index) && index > 0 ? 'aisle' : ''} ${selected.includes(seat) ? 'chosen' : ''}`}
                          onClick={() => {
                            setError('');
                            if (selected.includes(seat))
                              setSelected(selected.filter((s) => s !== seat));
                            else if (selected.length < 8)
                              setSelected([...selected, seat]);
                            else
                              setError(
                                'You can reserve up to 8 seats at a time.',
                              );
                          }}
                        >
                          {index + 1}
                          {accessible ? ' ♿' : ''}
                        </button>
                      );
                    })}
                    <span>{row.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {show.layout.position === 'back' && (
            <div className="screen">SCREEN THIS WAY</div>
          )}
          <div className="seat-legend">
            <span>
              <i /> Available
            </span>
            <span>
              <i className="chosen" /> Selected
            </span>
            <span>
              <i className="unavailable" /> Unavailable
            </span>
          </div>
          <p className="muted small-text">
            Choose up to 8 seats. Availability refreshes every 15 seconds; seats
            are confirmed when you reserve.
          </p>
        </div>
        <form className="panel booking-summary" onSubmit={reserve}>
          <p className="eyebrow accent">YOUR MOVIE NIGHT</p>
          <h2>Reservation summary</h2>
          <h3>{show.movie.title}</h3>
          <p className="muted">
            {show.theatre?.name || 'Quick Show Cinema'} · Screen {show.screen}
            <br />
            <small>
              {show.theatre?.city} · {show.theatre?.address}
            </small>
            <br />
            {dateLabel(show.date)} · {show.time} IST
          </p>
          <hr />
          <div className="summary-line">
            <span>Seats ({selected.length})</span>
            <strong>
              {selected.length
                ? [...selected].sort().join(', ')
                : 'Select seats'}
            </strong>
          </div>
          <div className="summary-line total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <p className="notice">
            Unpaid reservation only. Payment is not enabled. This is a
            development preview, not an admission ticket.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              required
            />
            I understand this is an unpaid demo reservation.
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button full"
            disabled={!selected.length || !accepted || busy}
          >
            {busy ? 'Reserving…' : 'Reserve seats'} {!busy && '↗'}
          </button>
          <p className="muted small-text">
            No booking fee. Cancel any time before the screening starts.
          </p>
        </form>
      </div>
    </section>
  );
}
