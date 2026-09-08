import { useEffect, useRef, useState, type ChangeEvent } from "react";
import axios from "axios";
import type { Conflict } from "./Conflict";
import { getErrorMessage } from "../lib/errors";

const MAX_BYTES = 25 * 1024 * 1024;

type UploadResult = { added: number; unchanged: number; conflicts: Conflict[] };

export default function CsvUpload({
  onFinished,
  onUploaded,
}: {
  onFinished: () => void;
  onUploaded: (conflicts: Conflict[]) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [inputKey, setInputKey] = useState(0);

  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setError(null);
    setRowErrors([]);

    if (file.size === 0) return setError("That file is empty.");
    if (file.size > MAX_BYTES) return setError("Files are limited to 25 MB.");

    setProgress(0);
    try {
      const res = await axios.post<UploadResult>("/api/upload", file, {
        headers: { "Content-Type": "text/csv" },
        onUploadProgress: (p) =>
          setProgress(p.total ? Math.round((p.loaded / p.total) * 100) : null),
      });
      setResult(res.data);
      onUploaded(res.data.conflicts);
      // Hold the summary long enough to read, then go back to the table.
      timer.current = window.setTimeout(onFinished, 1400);
    } catch (err) {
      setError(getErrorMessage(err, "Upload failed."));
      setRowErrors(rowErrorsFrom(err) ?? []);
    } finally {
      setProgress(null);
      setInputKey((k) => k + 1); // lets the same file be picked again
    }
  };

  return (
    <section className="panel">
      <label className="upload">
        <input key={inputKey} type="file" accept=".csv,.tsv" onChange={handleFile} />
        <span>Choose a CSV file</span>
      </label>

      {progress !== null && (
        <div className="bar" role="progressbar" aria-valuenow={progress}>
          <div style={{ width: `${progress}%` }} />
          <span>{progress < 100 ? `Uploading ${progress}%` : "Processing…"}</span>
        </div>
      )}

      {result && (
        <p className="ok">
          {result.added} added · {result.unchanged} unchanged · {result.conflicts.length} need review
        </p>
      )}

      {error && (
        <div className="err" role="alert">
          <p>{error}</p>
          {rowErrors.length > 0 && (
            <ul>
              {rowErrors.slice(0, 10).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
              {rowErrors.length > 10 && <li>and {rowErrors.length - 10} more</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function rowErrorsFrom(err: unknown): string[] | null {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  const errors = (data as { errors?: unknown })?.errors;
  return Array.isArray(errors) && errors.every((e) => typeof e === "string") ? errors : null;
}
