import { seatCategory, seatPrice } from './seatCategory.js';
// Booking.movie is the historical snapshot supplied by the booking API.
export function ticketPricing(booking) {
  if (
    booking.layout?.rows.some(
      (r) => r.category !== undefined || r.price != null,
    )
  ) {
    const groups = new Map();
    for (const seat of booking.seats) {
      const row = booking.layout.rows.find((r) => r.label === seat[0]);
      if (!row)
        return [
          {
            label: 'Recorded seat amount',
            quantity: null,
            rate: null,
            amount: booking.total,
          },
        ];
      const label = seatCategory(row),
        rate = seatPrice(row, booking.movie),
        key = JSON.stringify([label, rate]);
      const group = groups.get(key) || {
        label: `${label} seats`,
        quantity: 0,
        rate,
        amount: 0,
      };
      group.quantity++;
      group.amount += rate;
      groups.set(key, group);
    }
    const lines = [...groups.values()];
    if (lines.reduce((sum, line) => sum + line.amount, 0) !== booking.total)
      return [
        {
          label: 'Recorded seat amount',
          quantity: null,
          rate: null,
          amount: booking.total,
        },
      ];
    return [
      ...lines,
      { label: 'Booking fee', quantity: null, rate: null, amount: 0 },
    ];
  }
  const seatCount = booking.seats.length;
  const premiumCount = booking.seats.filter((seat) =>
    booking.layout
      ? booking.layout.rows.find((r) => r.label === seat[0])?.premium
      : /^[F-H]/.test(seat),
  ).length;
  const base = booking.movie.price;
  const premium = booking.movie.premiumPrice ?? 60;
  if (
    !Number.isFinite(base) ||
    !Number.isFinite(premium) ||
    base * seatCount + premium * premiumCount !== booking.total
  ) {
    return [
      {
        label: 'Recorded seat amount',
        quantity: null,
        rate: null,
        amount: booking.total,
      },
    ];
  }
  return [
    {
      label: 'Base seat fare',
      quantity: seatCount,
      rate: base,
      amount: seatCount * base,
    },
    ...(premiumCount
      ? [
          {
            label: booking.layout
              ? 'Premium upgrade'
              : 'Premium upgrade (rows F–H)',
            quantity: premiumCount,
            rate: premium,
            amount: premiumCount * premium,
          },
        ]
      : []),
    { label: 'Booking fee', quantity: null, rate: null, amount: 0 },
  ];
}
