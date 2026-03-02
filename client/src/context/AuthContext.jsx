import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(api.getToken);
  const [loading, setLoading] = useState(true);

  // On mount, verify existing token
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/api/admin/me')
      .then((data) => {
        setUser(data);
        setLoading(false);
      })
      .catch(() => {
        api.clearToken();
        setToken(null);
        setUser(null);
        setLoading(false);
      });
  }, [token]);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/api/auth/login', { username, password });
    api.setToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    api.clearToken();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
