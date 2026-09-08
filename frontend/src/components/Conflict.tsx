import { useEffect, useState } from "react";
import axios from "axios";
import { getErrorMessage } from "../lib/errors";

type Change = { field: string; oldValue: string; newValue: string };
type Incoming = { postId: number; name: string; email: string; body: string };

export type Conflict = {
  rowId: number;
  incoming: Incoming;
  changes: Change[];
};

export default function ConflictDialog({
  conflicts,
  onConflictsChange,
}: {
  conflicts: Conflict[];
  onConflictsChange: (conflicts: Conflict[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const send = async (url: string, body: unknown, next: Conflict[]) => {
    setBusy(true);
    setError(null);
    try {
      await axios.post(url, body);
      onConflictsChange(next);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't apply that."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
        <header className="modal-head">
          <h2 id="conflict-title">Conflicts</h2>
          <p className="muted">
            {conflicts.length} record{conflicts.length > 1 ? "s" : ""} in the new file already
            exist with different values. Resolve them to carry on.
          </p>
        </header>

        {error && <p className="err" role="alert">{error}</p>}

        <div className="modal-body">
          {conflicts.map((c) => (
            <article key={c.rowId} className="crow">
              <h3>id {c.rowId}</h3>

              <table className="diff">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Current</th>
                    <th>New</th>
                  </tr>
                </thead>
                <tbody>
                  {c.changes.map((ch) => (
                    <tr key={ch.field}>
                      <td className="field">{ch.field}</td>
                      <td className="old">{ch.oldValue}</td>
                      <td className="new">{ch.newValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="actions">
                <button
                  disabled={busy}
                  onClick={() => onConflictsChange(conflicts.filter((x) => x.rowId !== c.rowId))}
                >
                  Delete
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    send(
                      "/api/conflicts/resolve",
                      { rowId: c.rowId, incoming: c.incoming },
                      conflicts.filter((x) => x.rowId !== c.rowId)
                    )
                  }
                >
                  Keep
                </button>
              </div>
            </article>
          ))}
        </div>

        <footer className="modal-foot">
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              send(
                "/api/conflicts/keep-all",
                { conflicts: conflicts.map((c) => ({ rowId: c.rowId, incoming: c.incoming })) },
                []
              )
            }
          >
            Keep all
          </button>
          <button className="ghost" disabled={busy} onClick={() => onConflictsChange([])}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}
