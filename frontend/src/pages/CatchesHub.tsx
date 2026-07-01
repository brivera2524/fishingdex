import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Dex from "./Dex";
import MyCatches from "./MyCatches";

type Tab = "dex" | "catches";

export default function CatchesHub() {
  const location = useLocation();
  const initialTab = (location.state as { tab?: Tab } | null)?.tab ?? "dex";
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{tab === "dex" ? "Dex" : "My Catches"}</h1>
        {tab === "catches" && (
          <Link to="/log" className="button-link">
            + Log a catch
          </Link>
        )}
      </div>
      <div className="tab-switch">
        <button type="button" className={tab === "dex" ? "" : "secondary-button"} onClick={() => setTab("dex")}>
          Dex
        </button>
        <button
          type="button"
          className={tab === "catches" ? "" : "secondary-button"}
          onClick={() => setTab("catches")}
        >
          My Catches
        </button>
      </div>
      {tab === "dex" ? <Dex embedded /> : <MyCatches embedded />}
    </div>
  );
}
