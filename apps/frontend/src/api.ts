export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api(path: string, body?: unknown) {
  const response = await fetch(`http://localhost:3000/${path}`, {
    credentials: 'include',
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      typeof data.message === 'string'
        ? data.message
        : JSON.stringify(data.message || 'Request failed'),
      response.status,
    );
  }

  return data;
}

