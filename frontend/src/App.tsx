import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import RequireAuth from "./components/RequireAuth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import MyCatches from "./pages/MyCatches";
import CatchForm from "./pages/CatchForm";
import SpeciesList from "./pages/SpeciesList";
import CameraDetect from "./pages/CameraDetect";

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
            <Route path="/catches" element={<MyCatches />} />
            <Route path="/log" element={<CatchForm />} />
            <Route path="/catches/:id/edit" element={<CatchForm />} />
            <Route path="/species" element={<SpeciesList />} />
            <Route path="/" element={<Navigate to="/catches" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
