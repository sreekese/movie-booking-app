import QRCode from 'qrcode';
import { money } from '../api.js';
import { ticketPricing } from './ticketPricing.js';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char],
  );
function wrap(value, limit) {
  const lines = [''];
  for (const word of String(value).split(/\s+/)) {
    const last = lines.length - 1;
    if (lines[last] && `${lines[last]} ${word}`.length > limit)
      lines.push(word);
    else lines[last] += `${lines[last] ? ' ' : ''}${word}`;
  }
  return lines;
}
// Encode only the reference: a QR is not proof of payment or admission.
function reservationQr(reference, x, y) {
  const { modules } = QRCode.create(String(reference), {
    errorCorrectionLevel: 'M',
  });
  const quietZone = 4;
  const size = modules.size + quietZone * 2;
  const paths = [];
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column))
        paths.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
    }
  }
  return `<svg x="${x}" y="${y}" width="180" height="180" viewBox="0 0 ${size} ${size}" aria-label="Reservation reference QR code" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${paths.join('')}" fill="#000"/></svg>`;
}

export function ticketSvg(booking) {
  const cancelled = booking.status === 'cancelled';
  const title = wrap(booking.movie.title, 32);
  const date = new Date(`${booking.date}T12:00:00+05:30`).toLocaleDateString(
    'en-IN',
    {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    },
  );
  const titleHeight = title.length * 43;
  const detailsY = 183 + titleHeight;
  const breakdown = ticketPricing(booking);
  const venueLines = wrap(
    `${booking.theatre?.name || 'Quick Show Cinema'} · ${booking.theatre?.city || ''} · ${booking.theatre?.address || ''}`,
    85,
  );
  const billingY = detailsY + 305 + venueLines.length * 20;
  const qrY = billingY + 35 + breakdown.length * 30;
  const height = qrY + 270;
  const text = (x, y, value, size = 18, fill = '#162032', weight = 400) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}">${escape(value)}</text>`;
  const field = (x, y, label, value) =>
    text(x, y, label, 11, '#667085', 700) +
    text(x, y + 29, value, 19, '#162032', 600);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}" role="img" aria-labelledby="title description">
    <title id="title">Quick Show reservation ${escape(booking.id)}</title>
    <desc id="description">${escape(booking.movie.title)}. ${cancelled ? 'Cancelled. Seats released.' : 'Unpaid demo reservation.'} Not valid for admission.</desc>
    <rect width="1000" height="${height}" rx="24" fill="#ffffff"/>
    <path d="M24 0H976Q1000 0 1000 24V100H0V24Q0 0 24 0" fill="#111827"/>
    <g font-family="Arial, Helvetica, sans-serif">
      ${text(40, 59, 'quick', 32, '#ffffff', 700)}${text(122, 59, 'show', 32, '#f84568', 700)}
      ${text(40, 82, 'BIG STORIES. YOUR FAVOURITE SEAT.', 9, '#cbd5e1', 600)}
      ${text(745, 49, 'RESERVATION SUMMARY', 12, '#ffffff', 700)}
      ${text(745, 74, booking.id, 14, '#cbd5e1', 600)}
      <rect x="40" y="124" width="${cancelled ? 210 : 250}" height="29" rx="6" fill="${cancelled ? '#fee2e2' : '#fff0d6'}"/>
      ${text(53, 144, cancelled ? 'CANCELLED · SEATS RELEASED' : 'DEMO RESERVATION · UNPAID', 12, cancelled ? '#991b1b' : '#854d0e', 700)}
      ${title.map((line, i) => text(40, 197 + i * 43, line, 35, '#111827', 700)).join('')}
      ${text(40, detailsY + 5, `${booking.movie.language}  /  ${booking.movie.duration}  /  ${booking.movie.certificate}`, 15, '#667085')}
      ${field(40, detailsY + 53, 'DATE', date)}
      ${field(370, detailsY + 53, 'SHOWTIME', `${booking.time} IST`)}
      ${field(40, detailsY + 127, 'CINEMA', 'See venue details below')}
      ${field(370, detailsY + 127, 'SCREEN', `Screen ${booking.screen ?? booking.movie_id}`)}
      ${field(40, detailsY + 201, 'RESERVATION HOLDER', booking.name || 'Quick Show guest')}
      <path d="M700 112V${billingY - 55}" stroke="#d3d9e3" stroke-width="2" stroke-dasharray="7 7"/>
      ${text(742, 145, 'YOUR SEATS', 12, '#667085', 700)}
      ${wrap(booking.seats.join(' · '), 19)
        .map((line, i) => text(742, 183 + i * 32, line, 25, '#111827', 700))
        .join('')}
      ${text(742, detailsY + 85, `${booking.seats.length} ${booking.seats.length === 1 ? 'seat' : 'seats'}`, 15, '#667085')}
      ${text(742, detailsY + 141, 'RESERVATION TOTAL', 12, '#667085', 700)}
      ${text(742, detailsY + 180, money(booking.total), 34, '#111827', 700)}
      ${text(742, detailsY + 212, 'No payment collected', 14, '#667085')}
      ${venueLines.map((line, i) => text(40, detailsY + 265 + i * 20, line, 16)).join('')}
      <path d="M40 ${billingY - 35}H960" stroke="#e2e8f0"/>
      ${text(40, billingY - 12, 'AMOUNT BREAKDOWN', 12, '#667085', 700)}
      ${text(530, billingY - 12, 'QUANTITY × RATE', 11, '#667085', 700)}
      ${text(830, billingY - 12, 'AMOUNT', 11, '#667085', 700)}
      ${breakdown.map((line, i) => text(40, billingY + 17 + i * 30, line.label, 15) + text(530, billingY + 17 + i * 30, line.quantity === null ? '—' : `${line.quantity} × ${money(line.rate)}`, 15) + text(830, billingY + 17 + i * 30, money(line.amount), 16, '#162032', 600)).join('')}
      <path d="M40 ${qrY - 15}H960" stroke="#e2e8f0"/>
      ${reservationQr(booking.id, 40, qrY)}
      ${text(245, qrY + 50, 'RESERVATION QR CODE', 12, '#667085', 700)}
      ${text(245, qrY + 82, booking.id, 20, '#162032', 700)}
      ${text(245, qrY + 112, 'Scan to read your reservation reference.', 15, '#667085')}
      ${text(245, qrY + 138, cancelled ? 'Cancelled reservation. Not valid for admission.' : 'Reference only. Check current status in My bookings.', 14, '#667085')}
      <path d="M40 ${height - 73}H960" stroke="#e2e8f0"/>
      ${text(40, height - 43, 'NOT VALID FOR ADMISSION', 12, '#a12842', 700)}
      ${text(40, height - 22, cancelled ? 'This reservation was cancelled. The listed seats are no longer reserved.' : 'Unpaid development preview. View the latest reservation status in My bookings.', 12, '#667085')}
    </g>
    <rect x="1" y="1" width="998" height="${height - 2}" rx="23" fill="none" stroke="#d3d9e3" stroke-width="2"/>
  </svg>`;
}
export function ticketImageUrl(booking) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ticketSvg(booking))}`;
}
export async function downloadTicket(booking) {
  const image = new Image();
  image.src = ticketImageUrl(booking);
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth * 2;
  canvas.height = image.naturalHeight * 2;
  const context = canvas.getContext('2d');
  if (!context)
    throw new Error(
      'Unable to create your ticket image. Please use Print / Save PDF.',
    );
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob)
    throw new Error(
      'Unable to download your ticket. Please use Print / Save PDF.',
    );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${booking.id}${booking.status === 'cancelled' ? '-cancelled' : ''}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  // Keep the object URL alive until the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
