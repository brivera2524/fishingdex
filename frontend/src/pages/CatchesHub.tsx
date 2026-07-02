import { useState } from "react";
import { useLocation } from "react-router-dom";
import Dex from "./Dex";
import MyCatches from "./MyCatches";
import CatchForm, { type DetectState } from "./CatchForm";
import BottomSheet from "../components/BottomSheet";

type Tab = "dex" | "catches";

type LogSheetState = { mode: "new"; detectState?: DetectState } | { mode: "edit"; catchId: number } | null;

interface CatchesHubNavState {
  tab?: Tab;
  /** Set by the camera-identify flow to jump straight into the log sheet. */
  openLog?: DetectState;
}

export default function CatchesHub() {
  const location = useLocation();
  const navState = location.state as CatchesHubNavState | null;
  const [tab, setTab] = useState<Tab>(navState?.tab ?? "dex");
  const [logSheet, setLogSheet] = useState<LogSheetState>(
    navState?.openLog ? { mode: "new", detectState: navState.openLog } : null
  );
  // Bumped whenever a catch is saved so the currently-visible list remounts
  // and refetches — Dex/MyCatches only fetch on mount, and closing the log
  // sheet doesn't otherwise trigger that.
  const [refreshKey, setRefreshKey] = useState(0);

  function openNewCatch() {
    setTab("catches");
    setLogSheet({ mode: "new" });
  }

  function closeLogSheet() {
    setLogSheet(null);
  }

  function handleLogDone() {
    setLogSheet(null);
    setTab("catches");
    setRefreshKey((k) => k + 1);
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
      {tab === "dex" ? (
        <Dex embedded key={refreshKey} />
      ) : (
        <MyCatches embedded key={refreshKey} onEdit={(catchId) => setLogSheet({ mode: "edit", catchId })} />
      )}
      <button type="button" className="fab-floating" aria-label="Log a catch" onClick={openNewCatch}>
        +
      </button>

      <BottomSheet open={logSheet != null} onClose={closeLogSheet} fixedHeight>
        {logSheet && (
          <CatchForm
            catchId={logSheet.mode === "edit" ? logSheet.catchId : undefined}
            detectState={logSheet.mode === "new" ? logSheet.detectState : undefined}
            onDone={handleLogDone}
          />
        )}
      </BottomSheet>
    </div>
  );
}
