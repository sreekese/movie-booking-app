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
              previous.filter((s) => !data.occupied.includes(s)),
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
        body: { showId, seats: selected },
      });
      navigate(`/my-bookings?reservation=${booking.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      if (e.status === 409) {
        try {
          const updated = await api(`/shows/${showId}`);
          setShow(updated);
          setSelected((s) => s.filter((x) => !updated.occupied.includes(x)));
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
        <p role={error ? 'alert' : 'status'}>
          {error || 'Loading seat availability…'}
        </p>
        <Link to={`/movies/${id}`} className="text-link">
          Back to screenings
        </Link>
      </section>
    );
  const total = selected.reduce(
    (sum, seat) => sum + show.movie.price + (seat[0] >= 'F' ? 60 : 0),
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
        {show.movie.id}
      </p>
      <div className="booking-layout">
        <div className="panel seat-panel">
          <div className="screen">SCREEN THIS WAY</div>
          <div className="seat-scroll">
            <div className="seat-map">
              {'ABCDEFGH'.split('').map((row, i) => (
                <div key={row}>
                  {(i === 0 || i === 5) && (
                    <p className="seat-tier">
                      {i === 0 ? 'CLASSIC' : 'PREMIUM'} ·{' '}
                      {money(show.movie.price + (i === 5 ? 60 : 0))}
                    </p>
                  )}
                  <div className="seat-row">
                    <span>{row}</span>
                    {Array.from({ length: 12 }, (_, index) => {
                      const seat = `${row}${index + 1}`;
                      const occupied = show.occupied.includes(seat);
                      return (
                        <button
                          type="button"
                          key={seat}
                          disabled={occupied || busy}
                          aria-label={`Seat ${seat}, ${occupied ? 'unavailable' : selected.includes(seat) ? 'selected' : 'available'}`}
                          aria-pressed={selected.includes(seat)}
                          className={`seat ${index === 6 ? 'aisle' : ''} ${selected.includes(seat) ? 'chosen' : ''}`}
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
                        </button>
                      );
                    })}
                    <span>{row}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="seat-legend">
            <span>
              <i /> Available
            </span>
            <span>
              <i className="chosen" /> Selected
            </span>
            <span>
              <i className="unavailable" /> Reserved
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
            Quick Show Cinema · Screen {show.movie.id}
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
