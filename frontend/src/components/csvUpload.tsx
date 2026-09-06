import { useState, type ChangeEvent } from "react";
import axios from "axios";

export default function CsvUpload() {
  const [status, setStatus] = useState("");

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const csvData = new FormData();
    csvData.append("file", file);

    setStatus("Uploading…");
    try {
      const res = await axios.post("/api/upload", csvData);
      setStatus(`Done — ${res.data.count} rows`);
    } catch (err) {
      setStatus(axios.isAxiosError(err) ? err.message : "Upload failed");
    }
  };

  return (
    <div>
      <input type="file" accept=".csv" onChange={handleFile} />
      <p>{status}</p>
    </div>
  );
}
