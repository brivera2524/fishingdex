import { useState } from "react";
import { useLocation } from "react-router-dom";
import Dex from "./Dex";
import MyCatches from "./MyCatches";
import CatchForm, { type DetectState } from "./CatchForm";
import BottomSheet from "../components/BottomSheet";
import CatchCelebration, { type CelebrationDetails } from "../components/CatchCelebration";
import PullToRefresh from "../components/PullToRefresh";

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
  const [celebration, setCelebration] = useState<CelebrationDetails | null>(null);
  // Set right after logging/editing a catch so MyCatches opens straight to
  // it — the natural place to notice a mistake and fix it immediately, and
  // it doubles as confirmation the save actually went through. Cleared on
  // any *other* refresh (e.g. pull-to-refresh) so a stale id doesn't
  // reopen an old catch's sheet the next time MyCatches remounts.
  const [autoSelectCatchId, setAutoSelectCatchId] = useState<number | null>(null);

  function openNewCatch() {
    setTab("catches");
    setLogSheet({ mode: "new" });
  }

  function closeLogSheet() {
    setLogSheet(null);
  }

  function handleLogDone(celebrationDetails?: CelebrationDetails, catchId?: number) {
    setLogSheet(null);
    setTab("catches");
    setRefreshKey((k) => k + 1);
    setAutoSelectCatchId(catchId ?? null);
    if (celebrationDetails) setCelebration(celebrationDetails);
  }

  async function handlePullRefresh() {
    setRefreshKey((k) => k + 1);
    setAutoSelectCatchId(null);
    // Dex/MyCatches remount and show their own "Loading..." state — this
    // just keeps the pull indicator visible briefly so the gesture feels
    // like it did something, rather than snapping back instantly.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return (
    <div className="page">
      <PullToRefresh onRefresh={handlePullRefresh}>
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
          <MyCatches
            embedded
            key={refreshKey}
            onEdit={(catchId) => setLogSheet({ mode: "edit", catchId })}
            autoSelectCatchId={autoSelectCatchId ?? undefined}
          />
        )}
      </PullToRefresh>
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

      {celebration && <CatchCelebration details={celebration} onDone={() => setCelebration(null)} />}
    </div>
  );
}
