export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  let token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
  const buildConfig = (t: string | null) => {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    if (t) headers.set('Authorization', `Bearer ${t}`);
    return { ...options, headers };
  };

  let response = await fetch(`${API_BASE_URL}${url}`, buildConfig(token));

  if (response.status === 401 && typeof window !== 'undefined') {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const refreshToken = localStorage.getItem('refresh_token');

    if (refreshToken && user?.id) {
      const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, refreshToken }),
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        // Retry
        response = await fetch(`${API_BASE_URL}${url}`, buildConfig(data.access_token));
      } else {
        localStorage.clear();
        window.location.href = '/login';
      }
    } else {
      localStorage.clear();
      window.location.href = '/login';
    }
  }

  return response;
}
