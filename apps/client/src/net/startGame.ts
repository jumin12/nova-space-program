import { connectToRoom, enableLocalMode } from "../net/roomClient";
import { useGameStore } from "../store/gameStore";

export function startGame() {
  const store = useGameStore.getState();
  store.setPhase("connecting");
  store.setMessage("Connecting…");

  void document.documentElement.requestFullscreen().catch(() => {});

  void (async () => {
    for (let attempt = 1; attempt <= 6; attempt++) {
      const ok = await connectToRoom();
      if (ok) {
        store.setPhase("lobby");
        const agency = store.agency;
        store.setMessage(agency ? `Welcome to ${agency.name}` : "Welcome to Kerbin Space Center");
        return;
      }
      store.setMessage(`Connecting (${attempt}/6)…`);
      await new Promise((r) => setTimeout(r, 1500));
    }
    enableLocalMode();
    store.setPhase("lobby");
  })();
}
