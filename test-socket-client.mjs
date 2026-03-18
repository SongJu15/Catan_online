import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

socket.on("connect", () => {
  console.log("connected:", socket.id);
  socket.emit("ping-check", { hello: "world" });
});

socket.on("welcome", (data) => {
  console.log("welcome:", data);
});

socket.on("pong-check", (data) => {
  console.log("pong-check:", data);
  socket.disconnect();
});

socket.on("disconnect", (reason) => {
  console.log("disconnected:", reason);
  process.exit(0);
});
