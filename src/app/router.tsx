import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { Shell } from "./Shell";
import { RouteError } from "./RouteError";

/** Routes are code-split: each screen is its own chunk. */
const lazy = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: lazy(() => import("@/routes/Home")) },
      { path: "discover", lazy: lazy(() => import("@/routes/Discover")) },
      { path: "search", lazy: lazy(() => import("@/routes/Search")) },
      { path: "title/:source/:id/:slug?", lazy: lazy(() => import("@/routes/TitlePage")) },
      { path: "library", lazy: lazy(() => import("@/routes/Library")) },
      { path: "history", lazy: lazy(() => import("@/routes/HistoryPage")) },
      { path: "profile", lazy: lazy(() => import("@/routes/Profile")) },
      { path: "about", lazy: lazy(() => import("@/routes/About")) },
      { path: "home", element: <Navigate to="/" replace /> },
      { path: "*", lazy: lazy(() => import("@/routes/NotFound")) },
    ],
  },
  // full-screen routes without the shell
  { path: "/read/:source/:id/:chapterId", lazy: lazy(() => import("@/routes/Reader")), errorElement: <RouteError /> },
  { path: "/welcome", lazy: lazy(() => import("@/routes/Onboarding")), errorElement: <RouteError /> },
];

export const router = createBrowserRouter(routes);
