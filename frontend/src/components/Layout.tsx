import { AnimatePresence, motion } from "framer-motion";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Layout() {
  const { logout } = useAuth();
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="brand">Fish Pokedex</span>
        <button className="link-button" onClick={logout} style={{ color: "#fff" }}>
          Log out
        </button>
      </header>
      <main>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <nav className="bottom-nav">
        <NavLink to="/catches" className="bottom-nav-item">
          <span className="bottom-nav-icon">📋</span>
          My Catches
        </NavLink>
        <div className="fab-wrap">
          <NavLink to="/detect" className="fab" aria-label="Identify a fish">
            📷
          </NavLink>
        </div>
        <NavLink to="/species" className="bottom-nav-item">
          <span className="bottom-nav-icon">🐟</span>
          Species
        </NavLink>
      </nav>
    </div>
  );
}
