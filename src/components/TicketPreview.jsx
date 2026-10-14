import { ticketPricing } from '../utils/ticketPricing';
import { money } from '../api';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadTicket, ticketImageUrl } from '../utils/ticket';

export default function TicketPreview({ booking, onClose }) {
  const dialog = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      node.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="ticket-print-root"
      aria-labelledby="ticket-preview-title"
      onCancel={onClose}
    >
      <div className="ticket-toolbar no-print">
        <div>
          <h2 id="ticket-preview-title">Your reservation</h2>
          <p>
            Print this ticket or save it as a PDF using your browser’s print
            dialog.
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Close ticket preview"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <img
        className="ticket-artwork"
        src={ticketImageUrl(booking)}
        alt={`Reservation ${booking.id} for ${booking.movie.title}, ${booking.date}, ${booking.time} IST. Seats ${booking.seats.join(', ')}. ${booking.status}. ${ticketPricing(
          booking,
        )
          .map((line) => `${line.label}: ${money(line.amount)}`)
          .join(
            ', ',
          )}. Total ${money(booking.total)}. Unpaid demo, not valid for admission.`}
        onLoad={() => setReady(true)}
        onError={() =>
          toast.error('Unable to display the ticket. Please close and retry.')
        }
      />
      <div className="ticket-preview-actions no-print">
        <button
          className="button"
          disabled={!ready}
          onClick={() => window.print()}
        >
          <Printer size={17} /> Print / Save PDF
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await downloadTicket(booking);
            } catch (error) {
              toast.error(error.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={17} />
          {busy ? 'Preparing…' : 'Download PNG'}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
