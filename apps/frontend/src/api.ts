export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const configured = (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
const baseUrl = (configured || `${window.location.protocol}//${window.location.hostname}:3000`).replace(/\/+$/, '');
async function request(path: string, options: RequestInit) {
  const response = await fetch(`${baseUrl}/${path}`, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(typeof data?.message === 'string' ? data.message : `Request failed (HTTP ${response.status}).`, response.status);
  }
  if (data === null) throw new Error('The server returned an unreadable response.');
  return data;
}
export async function api(path: string, body?: unknown) {
  return request(path, { credentials: 'include', method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
// Public viewing never checks admin authentication or sends the session cookie.
export async function publicApi<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request(path, { credentials: 'omit', signal });
}
