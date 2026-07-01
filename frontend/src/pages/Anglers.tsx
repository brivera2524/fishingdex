import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listUsers } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { UserStat } from "../api/types";

export default function Anglers() {
  const [users, setUsers] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load anglers"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1>Anglers</h1>
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      <ul className="catch-list">
        {users.map((u) => (
          <li key={u.id} className="card card-tappable" onClick={() => navigate(`/anglers/${u.id}`)}>
            <div className="page-header">
              <span className="card-title">{u.display_name}</span>
              <span className="card-stat">{u.catch_count} catches</span>
            </div>
            <span className="card-meta">{u.species_count} species discovered</span>
          </li>
        ))}
        {!loading && users.length === 0 && <p>No anglers yet.</p>}
      </ul>
    </div>
  );
}
