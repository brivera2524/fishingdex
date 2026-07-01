import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listUsers } from "../api/endpoints";
import { ApiError } from "../api/client";
import Dex from "./Dex";
import MyCatches from "./MyCatches";

type Tab = "dex" | "catches";

export default function AnglerProfile() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const [tab, setTab] = useState<Tab>("dex");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then((users) => {
        const match = users.find((u) => u.id === userId);
        setDisplayName(match?.display_name ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load angler"));
  }, [userId]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{displayName ?? "Angler"}</h1>
        <Link to="/anglers" className="secondary-button">
          Back
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="tab-switch">
        <button type="button" className={tab === "dex" ? "" : "secondary-button"} onClick={() => setTab("dex")}>
          Dex
        </button>
        <button
          type="button"
          className={tab === "catches" ? "" : "secondary-button"}
          onClick={() => setTab("catches")}
        >
          Catches
        </button>
      </div>
      {tab === "dex" ? <Dex embedded userId={userId} /> : <MyCatches embedded userId={userId} readOnly />}
    </div>
  );
}
