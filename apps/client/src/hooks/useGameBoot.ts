import { useCallback, useEffect, useState } from "react";
import { bootstrapGameAssets, resetBootstrapForRetry } from "../game/assets/bootstrapAssets.js";
import { isCelestialAssetBundleCurrent } from "../game/assets/assetCache.js";

export type GameBootState = {
  ready: boolean;
  stage: string;
  progress: number;
  error: string | null;
};

const initial: GameBootState = {
  ready: isCelestialAssetBundleCurrent(),
  stage: isCelestialAssetBundleCurrent() ? "Ready" : "Starting…",
  progress: isCelestialAssetBundleCurrent() ? 1 : 0,
  error: null,
};

export function useGameBoot(): GameBootState & { retry: () => void } {
  const [state, setState] = useState<GameBootState>(initial);

  const startBoot = useCallback(() => {
    if (isCelestialAssetBundleCurrent()) {
      setState({ ready: true, stage: "Ready", progress: 1, error: null });
      return () => undefined;
    }

    setState({ ready: false, stage: "Starting…", progress: 0, error: null });
    let cancelled = false;

    void bootstrapGameAssets((stage, progress) => {
      if (cancelled) return;
      setState({ ready: false, stage, progress, error: null });
    })
      .then(() => {
        if (cancelled) return;
        setState({ ready: true, stage: "Ready", progress: 1, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load game assets";
        setState({ ready: false, stage: "Error", progress: 0, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = startBoot();
    return cleanup;
  }, [startBoot]);

  const retry = useCallback(() => {
    resetBootstrapForRetry();
    startBoot();
  }, [startBoot]);

  return { ...state, retry };
}
