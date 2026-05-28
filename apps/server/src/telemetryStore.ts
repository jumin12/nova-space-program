import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TelemetryLog } from "@orbital/common";

const DATA_DIR = join(process.cwd(), "data", "telemetry");

export async function saveTelemetryLog(log: TelemetryLog): Promise<string> {
  await mkdir(DATA_DIR, { recursive: true });
  const id = `${log.startedAt}-${log.playerName.replace(/\W+/g, "_")}`;
  const filePath = join(DATA_DIR, `${id}.json`);
  await writeFile(filePath, JSON.stringify(log, null, 2), "utf8");
  return id;
}
