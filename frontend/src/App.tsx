import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import RequireAuth from "./components/RequireAuth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import CatchesHub from "./pages/CatchesHub";
import MapPage from "./pages/Map";
import CameraDetect from "./pages/CameraDetect";
import Anglers from "./pages/Anglers";
import RecentCatches from "./pages/RecentCatches";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/detect"
            element={
              <RequireAuth>
                <CameraDetect />
              </RequireAuth>
            }
          />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/dex" element={<CatchesHub />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/anglers" element={<Anglers />} />
            <Route path="/recent" element={<RecentCatches />} />
            <Route path="/" element={<Navigate to="/dex" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
