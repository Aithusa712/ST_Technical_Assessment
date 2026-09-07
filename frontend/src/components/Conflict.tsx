import { useEffect, useState } from "react";
import axios from "axios";

type Change = { field: string; oldValue: string; newValue: string };

export type Conflict = {
  _id: string;
  commentId: number;
  changes: Change[];
};

export default function ConflictDialog({ conflicts }: { conflicts: Conflict[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const send = async (url: string) => {
    setBusy(true);
    setError(null);
    try {
      await axios.post(url);
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.error ?? "Couldn't apply that."
          : "Couldn't apply that."
      );
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
            <article key={c._id} className="crow">
              <h3>id {c.commentId}</h3>

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
                  onClick={() => send(`/api/conflicts/${c._id}/resolve?keep=current`)}
                >
                  Delete
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => send(`/api/conflicts/${c._id}/resolve?keep=new`)}
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
            onClick={() => send("/api/conflicts/keep-all")}
          >
            Keep all
          </button>
          <button className="ghost" disabled={busy} onClick={() => send("/api/conflicts/cancel")}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}
