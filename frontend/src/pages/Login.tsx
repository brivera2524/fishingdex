import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login, signup } from "../api/endpoints";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { setAuthenticated } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { access_token } =
        mode === "login"
          ? await login(displayName, password)
          : await signup(inviteCode, displayName, password);
      setAuthenticated(access_token);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page login-page">
      <div className="login-mark">
        <h1>🎣 Fish Pokedex</h1>
        <p className="login-byline">San Diego catch log</p>
      </div>
      <form onSubmit={handleSubmit} className="form card">
        {mode === "signup" && (
          <label>
            Invite code
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
          </label>
        )}
        <label>
          Username
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "..." : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>
      <button
        className="link-button"
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError(null);
        }}
      >
        {mode === "login" ? "New here? Sign up" : "Already have an account? Log in"}
      </button>
    </div>
  );
}
