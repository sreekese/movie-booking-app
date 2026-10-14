import LoadingSkeleton from './components/LoadingSkeleton';
import { Component, useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Provider from './Provider';
import { useApp } from './context';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Movies from './pages/Movies';
import MovieDetails from './pages/MovieDetails';
import SeatLayout from './pages/SeatLayout';
import MyBookings from './pages/MyBookings';
import FavouriteMovies from './pages/FavouriteMovies';
import Auth from './pages/Auth';
import Admin from './pages/Admin';
import Info from './pages/Info';
import Theatres from './pages/Theatres';

class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="container page empty">
        <h1>Something went wrong</h1>
        <p>Please reload the application.</p>
        <button className="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

function Protected({ children, admin = false }) {
  const { user, ready } = useApp();
  const location = useLocation();
  if (!ready)
    return (
      <div className="container page">
        <LoadingSkeleton label="Loading your account…" />
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  if (admin && !['admin', 'theatre_admin'].includes(user.role))
    return <Navigate to="/my-bookings" replace />;
  return children;
}

function RouteEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${pathname === '/' ? 'Movie nights, made easy' : pathname.startsWith('/movies') ? 'Movies & screenings' : pathname === '/my-bookings' ? 'My reservations' : pathname === '/favourite' ? 'Favourites' : pathname === '/admin' ? 'Administration' : 'Welcome'} | Quick Show`;
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function AppContent() {
  const location = useLocation();
  const { user, ready } = useApp();
  if (!ready)
    return (
      <main className="container page">
        <LoadingSkeleton label="Loading your account…" />
      </main>
    );
  if (
    ['admin', 'theatre_admin'].includes(user?.role) &&
    location.pathname !== '/admin'
  )
    return <Navigate to="/admin" replace />;
  return (
    <>
      <Toaster
        position="bottom-right"
        toastOptions={{ style: { background: '#1b2332', color: '#fff' } }}
      />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navbar />
      <RouteEffects />
      <main id="main-content" tabIndex={-1}>
        <Routes key={location.pathname}>
          <Route path="/" element={<Home />} />
          <Route path="/movies" element={<Movies />} />
          <Route path="/movies/:id" element={<MovieDetails />} />
          <Route
            path="/movies/:id/:date"
            element={
              <Protected>
                <SeatLayout />
              </Protected>
            }
          />
          <Route
            path="/my-bookings"
            element={
              <Protected>
                <MyBookings />
              </Protected>
            }
          />
          <Route
            path="/favourite"
            element={
              <Protected>
                <FavouriteMovies />
              </Protected>
            }
          />
          <Route path="/login" element={<Auth />} />
          <Route
            path="/admin"
            element={
              <Protected admin>
                <Admin />
              </Protected>
            }
          />
          {['about', 'theater', 'contact', 'privacy', 'terms'].map((type) => (
            <Route
              path={`/${type}`}
              key={type}
              element={type === 'theater' ? <Theatres /> : <Info type={type} />}
            />
          ))}
          <Route
            path="/about/vision"
            element={<Navigate to="/about" replace />}
          />
          <Route
            path="*"
            element={
              <section className="container page empty">
                <p className="eyebrow accent">404 / WRONG SCREEN</p>
                <h1>This page isn’t showing.</h1>
                <p>Let’s find you something good to watch.</p>
                <Link className="button" to="/movies">
                  Browse movies
                </Link>
              </section>
            }
          />
        </Routes>
      </main>
      {!['admin', 'theatre_admin'].includes(user?.role) && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Provider>
        <AppContent />
      </Provider>
    </ErrorBoundary>
  );
}
