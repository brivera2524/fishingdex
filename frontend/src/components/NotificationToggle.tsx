import { useEffect, useState } from "react";
import { updateNotificationMode } from "../api/endpoints";
import { getCurrentSubscription, subscribeToPush } from "../lib/push";
import type { NotificationMode } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import BottomSheet from "./BottomSheet";

const MODE_OPTIONS: { mode: NotificationMode; label: string; description: string }[] = [
  { mode: "all", label: "Every catch", description: "Notify me whenever anyone logs a catch" },
  { mode: "pb_and_record", label: "PBs & records", description: "Personal bests and all-time records" },
  { mode: "record_only", label: "Records only", description: "Only all-time leaderboard records" },
  { mode: "off", label: "Off", description: "No notifications" },
];

const MODE_LABELS: Record<NotificationMode, string> = {
  all: "Every catch",
  pb_and_record: "PBs & records",
  record_only: "Records only",
  off: "Off",
};

export default function NotificationToggle() {
  const { currentUser } = useAuth();
  const [mode, setMode] = useState<NotificationMode>("off");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // currentUser loads asynchronously (via getMe(), after AuthProvider
  // mounts) — on a fresh app launch this component renders before that
  // resolves, so seeding `mode`'s initial state directly from currentUser
  // would just lock in "off" forever the moment currentUser was still null.
  // Syncing here instead picks up the real saved mode once it arrives.
  useEffect(() => {
    if (currentUser) setMode(currentUser.notification_mode);
  }, [currentUser]);

  // Push only works for a home-screen-installed PWA on iOS — showing a
  // picker that would silently fail from a plain Safari tab is worse than
  // just explaining why it's unavailable.
  const isInstalled =
    typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;

  async function choose(next: NotificationMode) {
    setError(null);
    setSaving(true);
    try {
      if (next !== "off") {
        // Only subscribes if there's no existing subscription yet — flipping
        // between the three "on" modes (or back from "off") never re-prompts.
        const existing = await getCurrentSubscription();
        if (!existing) await subscribeToPush();
      }
      await updateNotificationMode(next);
      setMode(next);
      setOpen(false);
    } catch {
      setError("Couldn't update notifications — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="notification-toggle-button" onClick={() => setOpen(true)}>
        {mode === "off" ? "🔕" : "🔔"} {MODE_LABELS[mode]}
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)}>
        <div>
          <h1>Notifications</h1>
          {!isInstalled ? (
            <p style={{ marginTop: 12 }}>
              Add this app to your home screen first — notifications only work for the installed app, not a
              browser tab.
            </p>
          ) : (
            <>
              <p className="card-meta" style={{ marginTop: 4, marginBottom: 14 }}>
                Choose what you want to hear about.
              </p>
              {error && <p className="error">{error}</p>}
              <ul className="catch-list">
                {MODE_OPTIONS.map((opt) => (
                  <li
                    key={opt.mode}
                    className={`card card-tappable${mode === opt.mode ? " active" : ""}`}
                    onClick={() => !saving && choose(opt.mode)}
                  >
                    <div className="page-header">
                      <span className="card-title">{opt.label}</span>
                      {mode === opt.mode && <span className="card-stat">✓</span>}
                    </div>
                    <span className="card-meta">{opt.description}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
