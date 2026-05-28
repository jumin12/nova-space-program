import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_SERVER_PORT } from "@orbital/common";
import { LaunchRoom } from "./rooms/LaunchRoom.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "orbital-frontier-server" });
});

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("launch", LaunchRoom);

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Orbital Frontier server listening on http://localhost:${port}`);
});
