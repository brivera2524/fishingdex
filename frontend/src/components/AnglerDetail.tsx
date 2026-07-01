import { useState } from "react";
import Dex from "../pages/Dex";
import MyCatches from "../pages/MyCatches";

type Tab = "dex" | "catches";

interface AnglerDetailProps {
  userId: number;
  displayName: string;
}

export default function AnglerDetail({ userId, displayName }: AnglerDetailProps) {
  const [tab, setTab] = useState<Tab>("dex");

  return (
    <div>
      <h1>{displayName}</h1>
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
