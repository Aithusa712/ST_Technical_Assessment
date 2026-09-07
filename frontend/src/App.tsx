import { useState } from "react";
import Upload from "./components/CsvUpload";
import Table from "./components/Table";
import SocketUpdate from "./components/SocketUpdate";
import ConflictDialog, { type Conflict } from "./components/Conflict";

type Tab = "view" | "update";

export default function App() {
  const [tab, setTab] = useState<Tab>("view");
  // SocketUpdate reports what the server says; the dialog displays it. Neither
  // knows about the other.
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  const blocked = conflicts.length > 0;

  return (
    <main>
      <header>
        <h1>Comments dataset</h1>
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
          {tab === "view" ? <Table /> : <Upload onFinished={() => setTab("view")} />}
        </div>

        <SocketUpdate onConflicts={setConflicts} />
      </div>

      {blocked && <ConflictDialog conflicts={conflicts} />}
    </main>
  );
}
