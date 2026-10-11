import { useEffect, useState } from 'react';
import { api } from './api';
import { AppContext } from './context';
export default function Provider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [favourites, setFavourites] = useState([]);
  useEffect(() => {
    api('/me')
      .then(({ user }) => setUser(user))
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    let current = true;
    if (user)
      api('/favourites')
        .then((data) => {
          if (current) setFavourites(data);
        })
        .catch((e) => setError(e.message));
    return () => {
      current = false;
    };
  }, [user]);
  const logout = async () => {
    await api('/logout', { method: 'POST' });
    setUser(null);
    setFavourites([]);
  };
  const toggleFavourite = async (id) => {
    const saved = !favourites.includes(id);
    await api('/favourites', { method: 'POST', body: { movieId: id, saved } });
    setFavourites((list) =>
      saved ? [...new Set([...list, id])] : list.filter((x) => x !== id),
    );
  };
  return (
    <AppContext.Provider
      value={{ user, setUser, ready, favourites, toggleFavourite, logout }}
    >
      {error && (
        <div className="service-error" role="alert">
          Unable to reach the booking service. {error}{' '}
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}
      {children}
    </AppContext.Provider>
  );
}
