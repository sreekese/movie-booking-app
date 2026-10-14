import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { AppContext } from './context';
export default function Provider({ children }) {
  const [movies, setMovies] = useState([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState('');
  const reloadCatalogue = useCallback(async () => {
    setCatalogueLoading(true);
    try {
      setMovies(await api('/movies'));
      setCatalogueError('');
    } catch (error) {
      setCatalogueError(error.message);
    } finally {
      setCatalogueLoading(false);
    }
  }, []);
  useEffect(() => {
    let current = true;
    api('/movies')
      .then((data) => {
        if (current) setMovies(data);
      })
      .catch((error) => {
        if (current) setCatalogueError(error.message);
      })
      .finally(() => {
        if (current) setCatalogueLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [savedMovies, setSavedMovies] = useState({ userId: null, items: [] });
  const favouritesLoading = !!user && savedMovies.userId !== user.id;
  const favourites =
    user && savedMovies.userId === user.id ? savedMovies.items : [];
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
          if (current) setSavedMovies({ userId: user.id, items: data });
        })
        .catch((e) => {
          if (current) {
            setError(e.message);
            setSavedMovies({ userId: user.id, items: [] });
          }
        });
    return () => {
      current = false;
    };
  }, [user]);
  const logout = async () => {
    await api('/logout', { method: 'POST' });
    setUser(null);
    setSavedMovies({ userId: null, items: [] });
  };
  const toggleFavourite = async (id) => {
    const saved = !favourites.includes(id);
    await api('/favourites', { method: 'POST', body: { movieId: id, saved } });
    setSavedMovies((state) => ({
      userId: user.id,
      items: saved
        ? [...new Set([...state.items, id])]
        : state.items.filter((x) => x !== id),
    }));
  };
  return (
    <AppContext.Provider
      value={{
        movies,
        catalogueLoading,
        catalogueError,
        reloadCatalogue,
        user,
        setUser,
        ready,
        favourites,
        favouritesLoading,
        toggleFavourite,
        logout,
      }}
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
