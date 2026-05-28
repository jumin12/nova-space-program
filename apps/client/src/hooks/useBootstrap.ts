import { useEffect } from "react";
import { connectToRoom, enableLocalMode } from "../net/roomClient";
import { useGameStore } from "../store/gameStore";

const RETRY_MS = 2000;
const MAX_RETRIES = 8;
let bootstrapStarted = false;

export function useBootstrap(requestFullscreen: () => Promise<void>) {
  useEffect(() => {
    if (bootstrapStarted) return;
    bootstrapStarted = true;

    let cancelled = false;

    async function bootstrap() {
      const store = useGameStore.getState();
      store.setConnectionMode("connecting");
      store.setMessage("Connecting to launch server…");

      for (let attempt = 1; attempt <= MAX_RETRIES && !cancelled; attempt++) {
        const ok = await connectToRoom();
        if (cancelled) return;

        if (ok) {
          void requestFullscreen();
          return;
        }

        store.setMessage(`Server not reachable (attempt ${attempt}/${MAX_RETRIES})…`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }

      if (!cancelled) {
        enableLocalMode();
        void requestFullscreen();
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [requestFullscreen]);
}
