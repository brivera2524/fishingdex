import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Dex from "./Dex";
import MyCatches from "./MyCatches";

type Tab = "dex" | "catches";

export default function CatchesHub() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab = (location.state as { tab?: Tab } | null)?.tab ?? "dex";
  const [tab, setTab] = useState<Tab>(initialTab);

  function goLogCatch() {
    // So that coming back without saving (e.g. hitting back) lands on My
    // Catches rather than wherever the tab happened to be before.
    setTab("catches");
    navigate("/log");
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>{tab === "dex" ? "Dex" : "My Catches"}</h1>
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
      <button type="button" className="fab-floating" aria-label="Log a catch" onClick={goLogCatch}>
        +
      </button>
    </div>
  );
}
