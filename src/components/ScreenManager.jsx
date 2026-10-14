import { seatCategory } from '../utils/seatCategory';
import { useState } from 'react';
export default function ScreenManager({ theatre, screens, onSave }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const empty = () => ({
    name: '',
    layout: {
      rows: [{ label: 'A', count: 12, premium: false, aisles: [6] }],
      blocked: [],
      accessible: [],
    },
  });
  const updateRow = (index, key, value) =>
    setRecord((r) => ({
      ...r,
      layout: {
        position: 'front',
        ...r.layout,
        rows: r.layout.rows.map((row, i) =>
          i === index ? { ...row, [key]: value } : row,
        ),
      },
    }));
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await onSave(
        `/admin/screens${record.id ? `/${record.id}` : ''}`,
        record.id ? 'PUT' : 'POST',
        {
          ...record,
          theatre_id: theatre.id,
          layout: {
            ...record.layout,
            rows: record.layout.rows.map((row) => ({
              ...row,
              aisles: (row.aisles ?? (row.aisle ? [row.aisle] : []))
                .filter((value) => String(value).trim() !== '')
                .map(Number),
            })),
          },
        },
      );
      setSavedMessage(
        `Layout saved. ${result?.updatedShows || 0} upcoming screenings updated. ${result?.preservedShows || 0} screenings with booking history kept their original layout.`,
      );
      setRecord(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel screen-manager">
      <h2>Screens & seating · {theatre.name}</h2>
      <p className="muted">
        Create a layout for each screen. Saving a layout creates a new version
        used by new and upcoming unbooked screenings. Screenings with booking
        history keep their saved layout. Set row categories and optional seat
        prices.
      </p>
      <button
        className="button"
        disabled={busy}
        onClick={() => {
          setError('');
          setRecord(empty());
        }}
      >
        Add screen
      </button>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Screen</th>
              <th>Seats</th>
              <th>Version</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {screens
              .filter((s) => s.theatre_id === theatre.id)
              .map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    {s.layout.rows.reduce((n, r) => n + r.count, 0) -
                      s.layout.blocked.length}
                  </td>
                  <td>{s.version}</td>
                  <td>
                    <button
                      className="button secondary small"
                      disabled={busy}
                      onClick={() => {
                        setError('');
                        setRecord(structuredClone(s));
                      }}
                    >
                      Edit layout
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {record && (
        <form onSubmit={save} className="panel">
          <h3>{record.id ? 'New layout version' : 'Create screen'}</h3>
          <fieldset disabled={busy}>
            <label>
              Screen name
              <input
                required
                name="screen_name"
                maxLength={30}
                value={record.name}
                disabled={!!record.id}
                onChange={(e) => setRecord({ ...record, name: e.target.value })}
              />
            </label>
            <label>
              Screen position
              <select
                value={record.layout.position || 'front'}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    layout: { ...record.layout, position: e.target.value },
                  })
                }
              >
                <option value="front">Above seating</option>
                <option value="back">Below seating</option>
              </select>
            </label>
            <datalist id="seat-categories">
              {['Classic', 'Premium', 'Sofa', 'Recliner', 'VIP', 'Balcony'].map(
                (name) => (
                  <option key={name} value={name} />
                ),
              )}
            </datalist>
            <p className="muted">
              Choose or type a category name. Blank prices use the movie base
              price (plus its surcharge for Premium). Consecutive rows with the
              same category and price share a heading.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Row letter</th>
                    <th>Seats</th>
                    <th>Aisles after seats (e.g. 3,9)</th>
                    <th>Gap after row</th>
                    <th>Category / heading</th>
                    <th>Seat price (INR)</th>
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {record.layout.rows.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          aria-label={`Row ${i + 1} letter`}
                          required
                          pattern="[A-Z]"
                          maxLength={1}
                          value={row.label}
                          onChange={(e) =>
                            updateRow(i, 'label', e.target.value.toUpperCase())
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Row ${i + 1} seats`}
                          type="number"
                          min={1}
                          max={30}
                          required
                          value={row.count}
                          onChange={(e) =>
                            updateRow(i, 'count', Number(e.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Row ${i + 1} aisle`}
                          type="text"
                          placeholder="3,9"
                          pattern="[0-9]+(\s*,\s*[0-9]+)*"
                          value={(
                            row.aisles ?? (row.aisle ? [row.aisle] : [])
                          ).join(',')}
                          onChange={(e) =>
                            updateRow(i, 'aisles', e.target.value.split(','))
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Row ${i + 1} gap after`}
                          value={row.gapAfter ?? 0}
                          onChange={(e) =>
                            updateRow(i, 'gapAfter', Number(e.target.value))
                          }
                        >
                          <option value={0}>Normal</option>
                          <option value={16}>Small gap</option>
                          <option value={32}>Medium gap</option>
                          <option value={48}>Large gap</option>
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`Row ${i + 1} category`}
                          list="seat-categories"
                          maxLength={30}
                          required
                          value={row.category ?? seatCategory(row)}
                          onChange={(e) => {
                            const category = e.target.value;
                            setRecord((r) => ({
                              ...r,
                              layout: {
                                ...r.layout,
                                rows: r.layout.rows.map((item, index) =>
                                  index === i
                                    ? {
                                        ...item,
                                        category,
                                        premium:
                                          category.toLowerCase() === 'premium',
                                      }
                                    : item,
                                ),
                              },
                            }));
                          }}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Row ${i + 1} price`}
                          type="number"
                          min={1}
                          max={10000}
                          placeholder="Movie price"
                          value={row.price ?? ''}
                          onChange={(e) =>
                            updateRow(
                              i,
                              'price',
                              e.target.value === ''
                                ? null
                                : Number(e.target.value),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={record.layout.rows.length === 1}
                          onClick={() =>
                            setRecord({
                              ...record,
                              layout: {
                                ...record.layout,
                                rows: record.layout.rows.filter(
                                  (_, index) => index !== i,
                                ),
                              },
                            })
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="button secondary small"
              disabled={record.layout.rows.length >= 26}
              onClick={() =>
                setRecord({
                  ...record,
                  layout: {
                    ...record.layout,
                    rows: [
                      ...record.layout.rows,
                      {
                        label: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(
                          (letter) =>
                            !record.layout.rows.some((r) => r.label === letter),
                        ),
                        count: 12,
                        aisles: [6],
                        premium: false,
                      },
                    ],
                  },
                })
              }
            >
              Add row
            </button>
            {['blocked', 'accessible'].map((key) => (
              <label key={key}>
                {key === 'blocked' ? 'Blocked' : 'Accessible'} seats
                (comma-separated, e.g. A1,A2)
                <input
                  value={record.layout[key].join(',')}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      layout: {
                        ...record.layout,
                        [key]: e.target.value.toUpperCase().split(','),
                      },
                    })
                  }
                  onBlur={() =>
                    setRecord((r) => ({
                      ...r,
                      layout: {
                        ...r.layout,
                        [key]: r.layout[key]
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                />
              </label>
            ))}
            <p className="muted">
              Enter seat numbers separated by commas to place multiple aisles.
              For left and right gaps in a 12-seat row, enter 3,9. Leave blank
              for no aisles. Use Gap after row to add a walkway between rows.
            </p>
            <div className="seat-scroll">
              <div className="seat-map">
                {record.layout.position !== 'back' && (
                  <div className="screen">SCREEN THIS WAY</div>
                )}
                {record.layout.rows.map((r, i) => (
                  <div key={i}>
                    {(!record.layout.rows[i - 1] ||
                      seatCategory(record.layout.rows[i - 1]) !==
                        seatCategory(r) ||
                      record.layout.rows[i - 1].price !== r.price) && (
                      <p className="seat-tier">
                        {seatCategory(r)} ·{' '}
                        {r.price != null
                          ? `₹${r.price}`
                          : r.premium
                            ? 'Movie price + premium surcharge'
                            : 'Movie price'}
                      </p>
                    )}
                    <div
                      className="seat-row"
                      style={{ paddingBottom: r.gapAfter ?? 0 }}
                    >
                      <span>{r.label}</span>
                      {Array.from(
                        { length: Math.max(0, Math.min(30, r.count)) },
                        (_, j) => (
                          <span
                            key={j}
                            className={`seat ${(r.aisles ?? (r.aisle ? [r.aisle] : [])).map(Number).includes(j) && j > 0 ? 'aisle' : ''} ${r.premium ? 'chosen' : ''}`}
                            style={{
                              opacity: record.layout.blocked.includes(
                                `${r.label}${j + 1}`,
                              )
                                ? 0.25
                                : 1,
                            }}
                          >
                            {j + 1}
                            {record.layout.accessible.includes(
                              `${r.label}${j + 1}`,
                            )
                              ? '♿'
                              : ''}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                ))}
                {record.layout.position === 'back' && (
                  <div className="screen">SCREEN THIS WAY</div>
                )}
              </div>
            </div>
            <p className="muted">
              Pink seats are premium. Dimmed seats are blocked. ♿ marks
              accessible seats.
            </p>
            <div className="actions">
              <button className="button" type="submit">
                {busy ? 'Saving…' : 'Save layout'}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => setRecord(null)}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {savedMessage && <p role="status">{savedMessage}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
