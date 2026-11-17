import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

/** Last-resort error screen (also covers failed lazy chunk loads after an update). */
export function RouteError() {
  const e = useRouteError();
  const chunkFailed = e instanceof Error && /dynamically imported module|Loading chunk|Failed to fetch/i.test(e.message);
  // A screen's code failing to load while offline is not an update: say so plainly.
  const offline = chunkFailed && typeof navigator !== "undefined" && navigator.onLine === false;
  const chunk = chunkFailed && !offline;
  return (
    <div className="page page-narrow">
      <div className="state">
        <h1 style={{ fontSize: "var(--text-xl)" }}>{offline ? "You're offline" : chunk ? "Dawghwa was updated" : isRouteErrorResponse(e) ? `${e.status} ${e.statusText}` : "This screen hit a problem"}</h1>
        <p className="muted">{offline ? "This screen hasn't been saved for offline use yet. Reconnect and try again; your library and progress are saved on this device." : chunk ? "Reload to get the latest version. Your library and progress are saved." : "Your library and reading progress are safe. Try again, or go back home."}</p>
        <div className="cluster">
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
          <Link className="btn" to="/">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
