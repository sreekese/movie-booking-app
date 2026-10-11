import { Link } from 'react-router-dom';
const content = {
  about: [
    'A little closer to the movies.',
    'Quick Show brings movie discovery, seat selection, and reservations together in one simple experience.',
    'This project runs a sample revival programme featuring classic films. Movie imagery and metadata are used for demonstration. Screening times and the cinema are fictional.',
  ],
  theater: [
    'Welcome to Quick Show Cinema.',
    'Five dedicated screens. Classic and premium seating. A place for every movie fan.',
    'Each screen has 96 seats across eight rows. Rows A–E offer classic seats; rows F–H are premium seats at an additional ₹60 per seat. All screenings are 2D, in English, and displayed in India Standard Time (IST). This is a fictional venue for development; there is no physical address or real admission.',
  ],
  contact: [
    'A little help for movie night.',
    'Find answers to the most common reservation questions below.',
    'For this local development project, support is provided by the project operator. No live customer support, email delivery, or external cinema connection is configured.',
  ],
  privacy: [
    'Your data, explained.',
    'Your account and reservation data are stored by this application.',
    'We store your name, email, password hash, saved movies, and reservation history in the application database. Your password is salted and hashed. An essential HTTP-only session cookie keeps you signed in for up to seven days. No payment details are collected. Sign out to remove your session. Contact the project operator for account data export or deletion. This development notice must be reviewed by the operator before a public launch.',
  ],
  terms: [
    'Before you reserve.',
    'This application is a development preview with no payment processing.',
    'Reservations are unpaid, do not constitute purchased tickets, and are not valid for cinema admission. You may reserve up to eight seats per booking and cancel before the screening begins. Prices are in INR; premium rows cost ₹60 extra per seat, with no additional booking fee. Seat availability is confirmed on the server at reservation time. Sample screenings are generated seven days ahead, in IST.',
  ],
};
export default function Info({ type }) {
  const [title, intro, description] = content[type];
  return (
    <section className="container page prose">
      <p className="eyebrow accent">QUICK SHOW / {type.toUpperCase()}</p>
      <h1>{title}</h1>
      <p className="intro">{intro}</p>
      <p className="muted">{description}</p>
      {['contact', 'theater'].includes(type) && (
        <div className="faq">
          <h2>Good to know</h2>
          <details>
            <summary>How do I reserve seats?</summary>
            <p>
              Choose a movie, select a screening, sign in, and pick up to eight
              seats. Review the total and confirm your unpaid reservation.
            </p>
          </details>
          <details>
            <summary>Can I cancel my reservation?</summary>
            <p>
              Yes. Open My bookings and choose Cancel reservation before the
              screening starts. Your seats will become available again.
            </p>
          </details>
          <details>
            <summary>Where is my ticket?</summary>
            <p>
              My bookings contains a downloadable reservation summary. Payment
              and real admission tickets are not enabled.
            </p>
          </details>
        </div>
      )}
      <Link className="button" to="/movies">
        Explore the programme ↗
      </Link>
    </section>
  );
}
