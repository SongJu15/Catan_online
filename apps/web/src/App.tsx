import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export default function App() {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState("starting...");
  const [connected, setConnected] = useState(false);
  const [sid, setSid] = useState("-");
  const [welcome, setWelcome] = useState("-");
  const [pong, setPong] = useState("No pong-check yet");

  useEffect(() => {
    const s = io("http://localhost:3001", {
      transports: ["polling", "websocket"],
      reconnection: true,
    });
    socketRef.current = s;

    setStatus("socket created");

    s.on("connect", () => {
      setConnected(true);
      setSid(s.id ?? "-");
      setStatus("connected");
      console.log("connect", s.id);
    });

    s.on("disconnect", (reason) => {
      setConnected(false);
      setStatus(`disconnect: ${reason}`);
      console.log("disconnect", reason);
    });

    s.on("connect_error", (err) => {
      setConnected(false);
      setStatus(`connect_error: ${err.message}`);
      console.log("connect_error", err.message);
    });

    s.on("welcome", (data: any) => {
      setWelcome(JSON.stringify(data));
    });

    s.on("pong-check", (data: any) => {
      setPong(JSON.stringify(data, null, 2));
    });

    return () => {
      s.disconnect();
    };
  }, []);

  const sendPing = () => {
    socketRef.current?.emit("ping-check", { from: "web", at: Date.now() });
  };

  return (
    <div style={{ maxWidth: 760, margin: "40px auto", fontFamily: "Arial" }}>
      <h1>Catan Online - Web Client</h1>
      <p>Socket status: <b>{connected ? "Connected" : "Disconnected"}</b></p>
      <p>Status msg: <code>{status}</code></p>
      <p>Socket ID: <code>{sid}</code></p>
      <p>Welcome: {welcome}</p>

      <button onClick={sendPing}>Send ping-check</button>

      <pre style={{ background: "#f5f5f5", padding: 12, marginTop: 12 }}>{pong}</pre>
    </div>
  );
}
