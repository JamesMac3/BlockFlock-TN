import { lazy, Suspense } from "react";
import { HashRouter, Route, Routes, useParams } from "react-router-dom";
import HomePage from "./pages/Home/HomePage";
import EducationPage from "./pages/EducationPage";
import { PortalAuthProvider } from "./auth/PortalAuthContext";
import ProtectedPortalRoute from "./components/ProtectedPortalRoute";
import PortalLogin from "./components/PortalLogin";
import ChapterClaimPage from "./pages/ChapterClaimPage";
import CountyStatusPage from "./pages/CountyStatusPage";
import RecordsRequestGoalsPage from "./pages/RecordsRequestGoalsPage";
import StatewideStatusPage from "./pages/StatewideStatusPage";
import ArchivePage from "./pages/ArchivePage";
import AdminPostPreview from "./pages/AdminPostPreview";

const PortalDashboard = lazy(() => import("./pages/PortalDashboard"));

function AdminPostEditRoute() {
  const { postId } = useParams();
  return <PortalDashboard mode="admin" initialEditPostId={postId} />;
}


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
          element={<StatewideStatusPage />}
        />

        <Route
          path="/status/:countySlug"
          element={<CountyStatusPage />}
        />

        <Route
          path="/status/:countySlug/records-request-goals"
          element={<RecordsRequestGoalsPage />}
        />

        <Route
          path="/archive"
          element={<ArchivePage />}
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
          path="/chapters/claim"
          element={<ChapterClaimPage />}
        />

        <Route
          path="/portal/admin"
          element={
            <ProtectedPortalRoute role="admin">
              <Suspense fallback={<p className="portal-route-status">Loading administration...</p>}>
                <PortalDashboard mode="admin" />
              </Suspense>
            </ProtectedPortalRoute>
          }
        />

        <Route
          path="/portal/admin/posts/:postId/preview"
          element={
            <ProtectedPortalRoute role="admin">
              <AdminPostPreview />
            </ProtectedPortalRoute>
          }
        />

        <Route
          path="/portal/admin/posts/:postId/edit"
          element={
            <ProtectedPortalRoute role="admin">
              <Suspense fallback={<p className="portal-route-status">Loading editor...</p>}>
                <AdminPostEditRoute />
              </Suspense>
            </ProtectedPortalRoute>
          }
        />

        <Route
          path="/portal/chapter"
          element={
            <ProtectedPortalRoute role="chapter_master">
              <Suspense fallback={<p className="portal-route-status">Loading chapter portal...</p>}>
                <PortalDashboard mode="chapter" />
              </Suspense>
            </ProtectedPortalRoute>
          }
        />
      </Routes>
      </PortalAuthProvider>
    </HashRouter>
    
  );
}
