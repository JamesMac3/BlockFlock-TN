import { HashRouter, Route, Routes } from "react-router-dom";
import HomePage from "./pages/Home/HomePage";
import EducationPage from "./pages/EducationPage";
import { PortalAuthProvider } from "./auth/PortalAuthContext";
import PortalDashboard from "./pages/PortalDashboard";
import ProtectedPortalRoute from "./components/ProtectedPortalRoute";
import PortalLogin from "./components/PortalLogin";


function PlaceholderPage({ title }) {
  return (
    <main style={{ padding: "8rem 1.5rem 4rem" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <h1>{title}</h1>
        <p>This section will be built next.</p>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <HashRouter>
      <PortalAuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />

        <Route
          path="/education"
          element={<EducationPage />}
        />

        <Route
          path="/status"
          element={<PlaceholderPage title="Status" />}
        />

        <Route
          path="/strategies"
          element={<PlaceholderPage title="Paths to Positive Outcomes" />}
        />

        <Route
          path="/sources"
          element={<PlaceholderPage title="Sources" />}
        />

        <Route
          path="/about"
          element={<PlaceholderPage title="About" />}
        />

        <Route
          path="/portal/login"
          element={<PortalLogin />}
        />

        <Route
          path="/portal/admin"
          element={
            <ProtectedPortalRoute role="admin">
              <PortalDashboard mode="admin" />
            </ProtectedPortalRoute>
          }
        />

        <Route
          path="/portal/chapter"
          element={
            <ProtectedPortalRoute role="chapter_master">
              <PortalDashboard mode="chapter" />
            </ProtectedPortalRoute>
          }
        />
      </Routes>
      </PortalAuthProvider>
    </HashRouter>
    
  );
}
