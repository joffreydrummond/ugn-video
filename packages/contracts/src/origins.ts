/** Explicit HTTP(S) origins shared by the API and bucket initializer. */
export function frontendOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const values = (env.FRONTEND_ORIGINS || env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',');
  return [...new Set(values.map(value => {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Frontend origins must be HTTP(S) origins without paths, credentials, queries or fragments');
    }
    return url.origin;
  }))];
}
