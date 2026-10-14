import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticketPricing } from '../src/utils/ticketPricing.js';
import { ticketSvg } from '../src/utils/ticket.js';
const booking = {
  id: 'QS-TEST',
  date: '2026-10-14',
  time: '2:00 PM',
  seats: ['A1', 'F1'],
  total: 500,
  status: 'reserved',
  movie: {
    title: 'Original Film',
    price: 220,
    premiumPrice: 60,
    language: 'English',
    duration: '2h 0m',
    certificate: 'UA',
  },
};
test('ticket breakdown reconciles mixed seats with snapshotted prices', () => {
  const lines = ticketPricing(booking);
  assert.deepEqual(
    lines.map((l) => l.amount),
    [440, 60, 0],
  );
  assert.equal(
    lines.reduce((sum, l) => sum + l.amount, 0),
    booking.total,
  );
  assert.equal(lines[0].quantity, 2);
  assert.equal(lines[1].quantity, 1);
  assert.match(ticketSvg(booking), /AMOUNT BREAKDOWN/);
  assert.match(ticketSvg(booking), /2 × ₹220/);
  assert.match(ticketSvg({ ...booking, status: 'cancelled' }), /CANCELLED/);
});
test('classic-only and premium-only tickets reconcile without artificial charges', () => {
  assert.deepEqual(
    ticketPricing({ ...booking, seats: ['A1'], total: 220 }).map(
      (l) => l.amount,
    ),
    [220, 0],
  );
  assert.deepEqual(
    ticketPricing({ ...booking, seats: ['F1', 'H12'], total: 560 }).map(
      (l) => l.amount,
    ),
    [440, 120, 0],
  );
});
test('legacy discrepancies show the stored total instead of invented item amounts', () => {
  assert.deepEqual(ticketPricing({ ...booking, total: 480 }), [
    { label: 'Recorded seat amount', quantity: null, rate: null, amount: 480 },
  ]);
});

test('custom premium rows use the booking layout instead of row letters', () => {
  const custom = {
    ...booking,
    seats: ['A1', 'Z1'],
    layout: {
      rows: [
        { label: 'A', premium: true },
        { label: 'Z', premium: false },
      ],
    },
  };
  assert.deepEqual(
    ticketPricing(custom).map((l) => l.amount),
    [440, 60, 0],
  );
  assert.equal(ticketPricing(custom)[1].label, 'Premium upgrade');
});

test('custom seat categories itemize their stored rates', () => {
  const custom = {
    ...booking,
    seats: ['A1', 'A2', 'B1'],
    total: 1200,
    layout: {
      rows: [
        { label: 'A', category: 'Sofa', price: 450, premium: false },
        { label: 'B', category: 'VIP', price: 300, premium: false },
      ],
    },
  };
  assert.deepEqual(ticketPricing(custom), [
    { label: 'Sofa seats', quantity: 2, rate: 450, amount: 900 },
    { label: 'VIP seats', quantity: 1, rate: 300, amount: 300 },
    { label: 'Booking fee', quantity: null, rate: null, amount: 0 },
  ]);
});
