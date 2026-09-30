let revision: string | undefined;
export function setMapRevision(value: string) { revision = value; }
export function mapFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (revision) headers.set('X-Map-Revision', revision);
  return fetch(input, { ...init, headers });
}
