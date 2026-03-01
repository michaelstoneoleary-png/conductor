const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8080';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.data as T;
}

export const api = {
  get: <T>(path: string) => fetchAPI<T>(path),
  post: <T>(path: string, body: unknown, extraHeaders?: Record<string, string>) =>
    fetchAPI<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: extraHeaders,
    }),
  patch: <T>(path: string, body: unknown) =>
    fetchAPI<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};

export default api;
