/** Colyseus expects an http(s) endpoint, not ws:// */
export function getServerUrl(): string {
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }

  if (typeof window === "undefined") {
    return "http://127.0.0.1:2567";
  }

  // Dev: client (5173) talks directly to game server (2567). CORS is enabled on the server.
  if (import.meta.env.DEV) {
    return `http://${window.location.hostname}:2567`;
  }

  const { protocol, hostname } = window.location;
  const port = import.meta.env.VITE_SERVER_PORT ?? "2567";
  return `${protocol}//${hostname}:${port}`;
}
