/** Comms / signal readout (design §11.2 — no relay network in Stage 0). */
export function getSignalStatus(opts: {
  phase: string;
  launched: boolean;
  crashed: boolean;
  inSpace: boolean;
}): string {
  if (opts.crashed) return "NO SIGNAL";
  if (opts.phase === "preflight" || (opts.phase === "flight" && !opts.launched)) return "STANDBY";
  if (opts.phase === "flight" && opts.launched) return opts.inSpace ? "SPACE LINK" : "ACTIVE";
  if (opts.phase === "space" || opts.phase === "landed") return "STANDBY";
  return "STANDBY";
}

export function getConnectionLabel(mode: string): string {
  switch (mode) {
    case "online":
      return "Kerbin Online";
    case "local":
      return "Offline Sim";
    case "connecting":
    case "offline":
    default:
      return "Standby";
  }
}
