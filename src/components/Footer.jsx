import { Link } from 'react-router-dom';
export default function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <Link to="/" className="brand">
          quick<span>show</span>
        </Link>
        <p className="muted">Big stories. Your favourite seat.</p>
      </div>
      <div className="footer-links">
        <Link to="/about">About</Link>
        <Link to="/contact">Help & contact</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Booking terms</Link>
      </div>
      <p className="muted">
        © {new Date().getFullYear()} Quick Show · Demo cinema programme
      </p>
    </footer>
  );
}
