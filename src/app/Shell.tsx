import { useEffect, useState, useSyncExternalStore } from "react";
import { NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Compass, History, Home, Search, User, WifiOff, CloudOff, RefreshCw } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Avatar } from "@/components/Avatar";
import { Toasts } from "@/components/Toast";
import { apiHealth } from "@/lib/api/client";
import { network } from "@/lib/platform";
import { useUser } from "@/lib/store/user";
import { updateReady, applyUpdate } from "./pwa";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/search", label: "Search", icon: Search },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/profile", label: "Profile", icon: User },
];

function useOnline() {
  return useSyncExternalStore(network.subscribe, () => network.get().online, () => true);
}

function useApiHealth() {
  return useSyncExternalStore(apiHealth.subscribe, apiHealth.get, apiHealth.get);
}

export function Shell() {
  const loc = useLocation();
  const nav = useNavigate();
  const online = useOnline();
  const health = useApiHealth();
  const update = useSyncExternalStore(updateReady.subscribe, updateReady.get, updateReady.get);
  const profile = useUser((s) => s.profile);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        nav("/search");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [nav]);
  const inSearch = loc.pathname.startsWith("/search");
  // Title pages bring their own header and sticky read button on phones (blueprint), so the shell steps aside there.
  const immersive = loc.pathname.startsWith("/title/");
  return (
    <div className="shell" data-own-chrome={immersive || undefined}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Primary">
        <NavLink to="/" aria-label="Dawghwa home">
          <Brand />
        </NavLink>
        <nav>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={19} strokeWidth={1.9} />
              {label}
            </NavLink>
          ))}
          <NavLink to="/history">
            <History size={19} strokeWidth={1.9} />
            History
          </NavLink>
        </nav>
        <div className="sidebar-section">Shortcuts</div>
        <NavLink className="side-link" to="/search?q=hidden%20gems">
          Hidden gems
        </NavLink>
        <NavLink className="side-link" to="/discover?status=completed">
          Completed series
        </NavLink>
        <NavLink className="side-link" to="/discover?kind=manhwa&order=latest">
          New manhwa chapters
        </NavLink>
        <div className="sidebar-foot">
          {profile && (
            <NavLink to="/profile" className="side-link" style={{ minHeight: 52 }}>
              <Avatar name={profile.name} color={profile.color} size={30} />
              <span>
                {profile.name}
                <span className="dim" style={{ display: "block", fontSize: 11 }}>
                  Stored on this device
                </span>
              </span>
            </NavLink>
          )}
        </div>
      </aside>
      <div className="main">
        <header className="topbar" data-scrolled={scrolled ? "" : undefined}>
          <NavLink to="/" aria-label="Dawghwa home" className="brand-link">
            <Brand />
          </NavLink>
          {!inSearch && (
            <button className="search-trigger" onClick={() => nav("/search")} aria-label="Search">
              <Search size={18} />
              <span>Search titles, or try "completed fantasy manhwa"</span>
              <kbd>/</kbd>
            </button>
          )}
          {profile && (
            <NavLink to="/profile" className="topbar-avatar" aria-label={`Profile: ${profile.name}`}>
              <Avatar name={profile.name} color={profile.color} size={32} />
            </NavLink>
          )}
        </header>
        {!online ? (
          <div className="banner banner-warn" role="status">
            <WifiOff size={16} /> You're offline. Library, history and saved data still work; new content will load when you reconnect.
          </div>
        ) : health === "unreachable" ? (
          <div className="banner banner-warn" role="status">
            <CloudOff size={16} /> The Dawghwa service isn't responding right now. Showing what's saved on this device.
          </div>
        ) : null}
        {update && (
          <div className="banner" role="status">
            <RefreshCw size={16} /> A new version of Dawghwa is ready.
            <button className="btn btn-sm btn-primary" onClick={applyUpdate}>
              Update
            </button>
          </div>
        )}
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="site-foot">
          <span>Dawghwa does not host content. Titles, covers and chapters come from their providers through the Dawghwa API.</span>
          <a href="https://github.com/Titan717/dawghwa" rel="noopener" target="_blank">
            Source
          </a>
          <NavLink to="/about">About and credits</NavLink>
        </footer>
      </div>
      <nav className="bottomnav" aria-label="Primary">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <span className="nav-ico">
              <Icon size={21} strokeWidth={2} />
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
      <Toasts />
      <ScrollRestoration getKey={(l) => l.pathname + l.search} />
    </div>
  );
}
