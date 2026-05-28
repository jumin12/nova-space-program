import { Client } from "colyseus.js";

const client = new Client("ws://localhost:2567");
const room = await client.joinOrCreate("launch", { playerName: "TestPilot" });

console.log("joined", room.sessionId, "phase", room.state.phase);

room.send("start_build");
await waitForPhase(room, "build");
console.log("build phase ok");

room.send("launch");
await waitForPhase(room, "flight");
console.log("flight started", room.state.altitude);

for (let i = 0; i < 120; i++) {
  room.send("input", { throttle: 1, pitch: 0, yaw: 0, roll: 0, stage: i === 30, launch: true });
  await sleep(100);
  if (room.state.inSpace) {
    console.log("space reached at altitude", room.state.altitude);
    break;
  }
}

await room.leave();
console.log("integration test passed");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForPhase(room, phase) {
  return new Promise((resolve) => {
    if (room.state.phase === phase) {
      resolve();
      return;
    }
    const handler = () => {
      if (room.state.phase === phase) {
        room.onStateChange.remove(handler);
        resolve();
      }
    };
    room.onStateChange(handler);
    setTimeout(() => {
      room.onStateChange.remove(handler);
      resolve();
    }, 5000);
  });
}
