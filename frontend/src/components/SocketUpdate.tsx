import { useEffect, useState } from "react";
import { socket } from "../socket";

type Changes = { text: string; at: number };

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Sits in the sidebar for the whole session, logging what every session does. */
export default function SocketUpdate() {
  const [feed, setFeed] = useState<Changes[]>([]);
  // Seeded from the socket rather than set in the effect, so the effect body
  // does no synchronous setState.
  const [onlineStatus, setOnlineStatus] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setOnlineStatus(true);
    const onDisconnect = () => setOnlineStatus(false);
    const handleActivity = (a: Changes) => setFeed((prev) => [a, ...prev].slice(0, 40));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("activity", handleActivity);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("activity", handleActivity);
    };
  }, []);

  return (
    <aside className="panel feed">
      <div className="feed-head">
        <h2>Changes
        </h2>
        <span className={onlineStatus ? "online" : "offline"}>{onlineStatus ? "Online" : "Offline"}</span>
      </div>

      {feed.length === 0 ? (
        <p className="muted">Updates from any session appear here as they happen.</p>
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
