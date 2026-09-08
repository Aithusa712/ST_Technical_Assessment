import { useEffect, useState } from "react";
import axios from "axios";
import { socket } from "../socket";

type DatasetRow = {
  _id: string;
  rowId: number;
  postId: number;
  name: string;
  email: string;
  body: string;
};

type Page = { items: DatasetRow[]; total: number; page: number; pages: number };

export default function Table() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ requestKey: string; data: Page } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // What the current view is asking for. Comparing it against what was last
  // fetched gives us `loading` for free, with no setState before the request.
  const requestKey = `${page}|${query}`;
  const loading = result?.requestKey !== requestKey;
  const data = result?.data ?? null;

  // setState happens only in the promise callbacks, never in the effect body.
  useEffect(() => {
    const controller = new AbortController();

    axios
      .get<Page>("/api/rows", {
        params: { page, limit: 25, q: query },
        signal: controller.signal,
      })
      .then((res) => {
        setResult({ requestKey, data: res.data });
        setError(null);
      })
      .catch((err) => {
        if (!axios.isCancel(err)) setError("Couldn't load rows.");
      });

    // Aborting on change means a slow earlier response can't overwrite a newer one.
    return () => controller.abort();
  }, [requestKey, page, query, version]);

  // Any session changing the data refreshes this one. Refetching rather than
  // splicing in a pushed row keeps the page size and the active search honest.
  useEffect(() => {
    const onChanged = () => setVersion((v) => v + 1);
    socket.on("rows:changed", onChanged);
    return () => {
      socket.off("rows:changed", onChanged);
    };
  }, []);

  return (
    <section className="panel">
      <input
        className="search"
        type="search"
        value={query}
        placeholder="Search name, email or body"
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1); // a new search starts at the first page
        }}
      />

      {error && <p className="err" role="alert">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {data && data.items.length === 0 && !loading && (
        <p className="muted">
          {query ? `Nothing matches "${query}".` : "Upload a CSV to see rows here."}
        </p>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>id</th>
                  <th>postId</th>
                  <th>name</th>
                  <th>email</th>
                  <th>body</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r._id}>
                    <td>{r.rowId}</td>
                    <td>{r.postId}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td className="body" title={r.body}>{r.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
              Previous
            </button>
            <span>
              Page {data.page} of {data.pages} · {data.total} rows
            </span>
            <button disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
