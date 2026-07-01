import { AnimatePresence, motion } from "framer-motion";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AdminModelToggle from "./AdminModelToggle";

export default function Layout() {
  const { logout, currentUser } = useAuth();
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="brand">Fish Pokedex</span>
        <div className="top-bar-actions">
          {currentUser?.is_admin && <AdminModelToggle />}
          <button className="link-button" onClick={logout} style={{ color: "#fff" }}>
            Log out
          </button>
        </div>
      </header>
      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <nav className="bottom-nav">
        <NavLink
          to="/dex"
          className={({ isActive }) => `bottom-nav-item${isActive ? " active" : ""}`}
        >
          <span className="bottom-nav-icon">🐟</span>
          Dex
        </NavLink>
        <NavLink
          to="/map"
          className={({ isActive }) => `bottom-nav-item${isActive ? " active" : ""}`}
        >
          <span className="bottom-nav-icon">🗺️</span>
          Map
        </NavLink>
        <div className="fab-wrap">
          <NavLink to="/detect" className="fab" aria-label="Identify a fish">
            📷
          </NavLink>
        </div>
        <NavLink
          to="/anglers"
          className={({ isActive }) => `bottom-nav-item${isActive ? " active" : ""}`}
        >
          <span className="bottom-nav-icon">👤</span>
          Anglers
        </NavLink>
        <NavLink
          to="/leaderboard"
          className={({ isActive }) => `bottom-nav-item${isActive ? " active" : ""}`}
        >
          <span className="bottom-nav-icon">🏆</span>
          Leaders
        </NavLink>
      </nav>
    </div>
  );
}
