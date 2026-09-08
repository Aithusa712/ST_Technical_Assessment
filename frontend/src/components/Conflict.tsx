import { useEffect, useState } from "react";
import axios from "axios";

type Change = { field: string; oldValue: string; newValue: string };

export type Conflict = {
  _id: string;
  id: number;
  changes: Change[];
};

export default function ConflictDialog({
  reviewId,
  conflicts,
  onChange,
}: {
  reviewId: string;
  conflicts: Conflict[];
  onChange: (conflicts: Conflict[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // The action already tells us the resulting state, so we apply it directly
  // instead of refetching — this session is the only one that can see these.
  const send = async (url: string, next: Conflict[]) => {
    setBusy(true);
    setError(null);
    try {
      await axios.post(url);
      onChange(next);
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
              <h3>id {c.id}</h3>

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
                  onClick={() =>
                    send(
                      `/api/conflicts/${c._id}/resolve?keep=current`,
                      conflicts.filter((x) => x._id !== c._id)
                    )
                  }
                >
                  Delete
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    send(
                      `/api/conflicts/${c._id}/resolve?keep=new`,
                      conflicts.filter((x) => x._id !== c._id)
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
            onClick={() => send(`/api/conflicts/keep-all?reviewId=${reviewId}`, [])}
          >
            Keep all
          </button>
          <button
            className="ghost"
            disabled={busy}
            onClick={() => send(`/api/conflicts/cancel?reviewId=${reviewId}`, [])}
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}
