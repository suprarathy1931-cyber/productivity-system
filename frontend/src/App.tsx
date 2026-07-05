// =====================================================================
// App shell — navigation + routing
// =====================================================================
// Sidebar on desktop, collapsing to a bottom tab bar on mobile, per
// the earlier decision. Only Breath Log has a real page right now —
// the other 7 render a placeholder so the navigation pattern is
// provable end-to-end without pretending unbuilt modules are real.

import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { BreathLogPage } from "./modules/breath/BreathLogPage";
import "./App.css";

interface ModuleDef {
  path: string;
  label: string;
  icon: string;
  element: React.ReactNode;
}

const MODULES: ModuleDef[] = [
  { path: "/breath", label: "Breath", icon: "🫁", element: <BreathLogPage /> },
  { path: "/workout", label: "Workout", icon: "💪", element: <ComingSoon name="Workout & Training Journal" /> },
  { path: "/meals", label: "Meals", icon: "🍽️", element: <ComingSoon name="Meal Tracker" /> },
  { path: "/languages", label: "Languages", icon: "🗣️", element: <ComingSoon name="Languages" /> },
  { path: "/worklog", label: "Work Log", icon: "💼", element: <ComingSoon name="Work-log" /> },
  { path: "/hobbies", label: "Hobbies", icon: "🎯", element: <ComingSoon name="Hobbies Log" /> },
  { path: "/roadmap", label: "Roadmap", icon: "🗺️", element: <ComingSoon name="Roadmap + Focus" /> },
  { path: "/stats", label: "Stats", icon: "📊", element: <ComingSoon name="Overall Stats" /> },
];

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="module-page">
      <h1>{name}</h1>
      <p className="empty-state">
        Not built yet — Breath Log is the first module, proving the pattern
        before this one gets built the same way.
      </p>
    </div>
  );
}

function AppShell() {
  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-brand">Productivity System</div>
        {MODULES.map((m) => (
          <NavLink
            key={m.path}
            to={m.path}
            className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}
          >
            <span className="nav-icon">{m.icon}</span>
            <span className="nav-label">{m.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<BreathLogPage />} />
          {MODULES.map((m) => (
            <Route key={m.path} path={m.path} element={m.element} />
          ))}
        </Routes>
      </main>

      <nav className="bottom-tabs">
        {MODULES.map((m) => (
          <NavLink
            key={m.path}
            to={m.path}
            className={({ isActive }) => `tab-item ${isActive ? "tab-item-active" : ""}`}
          >
            <span className="tab-icon">{m.icon}</span>
            <span className="tab-label">{m.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
