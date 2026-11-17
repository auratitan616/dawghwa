import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

/** Last-resort error screen (also covers failed lazy chunk loads after an update). */
export function RouteError() {
  const e = useRouteError();
  const chunk = e instanceof Error && /dynamically imported module|Loading chunk|Failed to fetch/i.test(e.message);
  return (
    <div className="page page-narrow">
      <div className="state">
        <h1 style={{ fontSize: "var(--text-xl)" }}>{chunk ? "Dawghwa was updated" : isRouteErrorResponse(e) ? `${e.status} ${e.statusText}` : "This screen hit a problem"}</h1>
        <p className="muted">{chunk ? "Reload to get the latest version. Your library and progress are saved." : "Your library and reading progress are safe. Try again, or go back home."}</p>
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
