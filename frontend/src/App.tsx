import { useEffect, useState } from "react";
import axios from "axios";
import Upload from "./components/CsvUpload";
import Table from "./components/Table";
import SocketUpdate from "./components/SocketUpdate";
import ConflictDialog, { type Conflict } from "./components/Conflict";

type Tab = "view" | "update";
type Batch = { batchId: string; conflicts: Conflict[] };

const STORAGE_KEY = "pendingBatchId";

export default function App() {
  const [tab, setTab] = useState<Tab>("view");
  const [batch, setBatch] = useState<Batch | null>(null);

  const blocked = (batch?.conflicts.length ?? 0) > 0;

  // Recovers conflicts from a batch this same tab uploaded before a refresh.
  // Other tabs never see this — the batchId only lives here, never broadcast.
  useEffect(() => {
    const batchId = sessionStorage.getItem(STORAGE_KEY);
    if (!batchId) return;

    axios
      .get<Conflict[]>("/api/conflicts", { params: { batchId } })
      .then((res) => {
        if (res.data.length) setBatch({ batchId, conflicts: res.data });
        else sessionStorage.removeItem(STORAGE_KEY);
      })
      .catch(() => sessionStorage.removeItem(STORAGE_KEY));
  }, []);

  const handleUploaded = (batchId: string, conflicts: Conflict[]) => {
    if (!conflicts.length) return;
    sessionStorage.setItem(STORAGE_KEY, batchId);
    setBatch({ batchId, conflicts });
  };

  const handleBatchChange = (conflicts: Conflict[]) => {
    if (!conflicts.length) sessionStorage.removeItem(STORAGE_KEY);
    setBatch((b) => (b ? { ...b, conflicts } : b));
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

      {blocked && batch && (
        <ConflictDialog
          batchId={batch.batchId}
          conflicts={batch.conflicts}
          onChange={handleBatchChange}
        />
      )}
    </main>
  );
}
