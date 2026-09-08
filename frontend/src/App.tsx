import { useState } from "react";
import Upload from "./components/CsvUpload";
import Table from "./components/Table";
import SocketUpdate from "./components/SocketUpdate";
import ConflictDialog, { type Conflict } from "./components/Conflict";

type Tab = "view" | "update";
type Review = { reviewId: string; conflicts: Conflict[] };

export default function App() {
  const [tab, setTab] = useState<Tab>("view");
  const [activeConflicts, setActiveConflicts] = useState<Review | null>(null);

  const blocked = (activeConflicts?.conflicts.length ?? 0) > 0;

  const handleUploaded = (reviewId: string, conflicts: Conflict[]) => {
    if (!conflicts.length) return;
    setActiveConflicts({ reviewId, conflicts });
  };

  const handleReviewChange = (conflicts: Conflict[]) => {
    setActiveConflicts((b) => (b ? { ...b, conflicts } : b));
  };

  return (
    <main>
      <header>
        <h1>Sample dataset</h1>
      </header>

      <div className="tabs" role="tablist">
        {(["view", "update"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "tab active" : "tab"}
            disabled={blocked}
            title={blocked ? "Resolve the conflicts first" : undefined}
            onClick={() => setTab(t)}
          >
            {t === "view" ? "View" : "Update"}
          </button>
        ))}
      </div>

      <div className="split">
        <div className="pane">
          {tab === "view" ? (
            <Table />
          ) : (
            <Upload onUploaded={handleUploaded} onFinished={() => setTab("view")} />
          )}
        </div>

        <SocketUpdate />
      </div>

      {blocked && activeConflicts && (
        <ConflictDialog
          reviewId={activeConflicts.reviewId}
          conflicts={activeConflicts.conflicts}
          onChange={handleReviewChange}
        />
      )}
    </main>
  );
}
