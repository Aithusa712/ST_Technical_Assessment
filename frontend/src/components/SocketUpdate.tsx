import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { socket } from "../socket";
import type { Conflict } from "./Conflict";

type Activity = { text: string; at: number };

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Sits in the sidebar for the whole session, so it's the one place that always
 * has a socket. It logs what every session does and reports pending conflicts
 * upward — App decides what to do with them. That's why it never unmounts: a
 * conflict raised by the other user has to reach this session on any tab.
 */
export default function SocketUpdate({ onConflicts }: { onConflicts: (c: Conflict[]) => void }) {
  const [feed, setFeed] = useState<Activity[]>([]);
  // Seeded from the socket rather than set in the effect, so the effect body
  // does no synchronous setState.
  const [live, setLive] = useState(socket.connected);

  const loadConflicts = useCallback(async () => {
    const res = await axios.get<Conflict[]>("/api/conflicts");
    onConflicts(res.data);
  }, [onConflicts]);

  useEffect(() => {
    const onConnect = () => {
      setLive(true);
      loadConflicts(); // catch up on anything missed while disconnected
    };
    const onDisconnect = () => setLive(false);
    const onActivity = (a: Activity) => setFeed((prev) => [a, ...prev].slice(0, 40));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("conflicts:changed", loadConflicts);
    socket.on("activity", onActivity);

    // First load. Nothing is set until the response arrives, so this is safe here.
    loadConflicts();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("conflicts:changed", loadConflicts);
      socket.off("activity", onActivity);
    };
  }, [loadConflicts]);

  return (
    <aside className="panel feed">
      <div className="feed-head">
        <h2>Activity</h2>
        <span className={live ? "dot on" : "dot"}>{live ? "Live" : "Offline"}</span>
      </div>

      {feed.length === 0 ? (
        <p className="muted">Changes made in any session appear here as they happen.</p>
      ) : (
        <ol>
          {feed.map((a, i) => (
            <li key={`${a.at}-${i}`}>
              <time>{time(a.at)}</time>
              <span>{a.text}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
