import { Room, Client } from "@colyseus/core";
import {
  DEFAULT_CONTROL,
  DEFAULT_CRAFT,
  PHYSICS,
  type ControlInput,
  type CraftDefinition,
  type TelemetryLog,
} from "@orbital/common";
import {
  craftToDefinition,
  createVesselOnPad,
  isFlightComplete,
  snapshotFromVessel,
  stepVessel,
  type VesselState,
} from "@orbital/physics";
import { LaunchRoomState, PlayerState } from "../schema.js";
import { saveTelemetryLog } from "../telemetryStore.js";

type LaunchOptions = {
  playerName?: string;
};

export class LaunchRoom extends Room<LaunchRoomState> {
  maxClients = 16;
  private vessel: VesselState | null = null;
  private pilotInput: ControlInput = { ...DEFAULT_CONTROL };
  private flightStartedAt = 0;
  private loopHandle: ReturnType<typeof setInterval> | null = null;

  onCreate() {
    this.setState(new LaunchRoomState());
    this.state.craftJson = JSON.stringify(DEFAULT_CRAFT.parts);
    this.state.craftName = DEFAULT_CRAFT.name;

    this.onMessage("set_name", (client, name: string) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.name = String(name).slice(0, 24);
    });

    this.onMessage("set_role", (client, role: string) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (role === "pilot") {
        for (const [, p] of this.state.players) {
          if (p.role === "pilot" && p.sessionId !== client.sessionId) {
            p.role = "spectator";
          }
        }
        player.role = "pilot";
        this.state.pilotSessionId = client.sessionId;
      } else {
        player.role = "spectator";
        if (this.state.pilotSessionId === client.sessionId) {
          this.state.pilotSessionId = "";
        }
      }
    });

    this.onMessage("set_ready", (client, ready: boolean) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.ready = !!ready;
    });

    this.onMessage("set_craft", (client, craft: CraftDefinition) => {
      if (this.state.phase !== "lobby" && this.state.phase !== "build") return;
      if (client.sessionId !== this.state.pilotSessionId) return;
      this.state.craftName = craft.name.slice(0, 48);
      this.state.craftJson = JSON.stringify(craft.parts);
      this.state.message = `${this.state.craftName} updated`;
    });

    this.onMessage("start_build", () => {
      if (this.state.phase === "lobby") {
        this.state.phase = "build";
        this.state.message = "Vehicle assembly";
      }
    });

    this.onMessage("return_lobby", () => {
      this.stopSimulation();
      this.vessel = null;
      this.state.phase = "lobby";
      this.state.message = "Returned to Space Center";
      this.resetFlightFields();
    });

    this.onMessage("go_preflight", (client) => {
      if (client.sessionId !== this.state.pilotSessionId) return;
      if (this.state.phase !== "lobby" && this.state.phase !== "build") return;
      this.pilotInput = { ...DEFAULT_CONTROL };
      this.state.phase = "preflight";
      this.state.message = "On launch pad — Shift throttle, Space to release clamps";
      this.startSimulation();
    });

    this.onMessage("cancel_preflight", (client) => {
      if (client.sessionId !== this.state.pilotSessionId) return;
      if (this.state.phase !== "preflight") return;
      this.stopSimulation();
      this.vessel = null;
      this.pilotInput = { ...DEFAULT_CONTROL };
      this.state.phase = "build";
      this.state.message = "Vehicle assembly";
      this.resetFlightFields();
    });

    this.onMessage("launch", (client) => {
      if (client.sessionId !== this.state.pilotSessionId) return;
      if (this.state.phase !== "preflight") return;
      this.beginFlight(client.sessionId);
    });

    this.onMessage("input", (client, input: Partial<ControlInput>) => {
      if (client.sessionId !== this.state.pilotSessionId) return;
      if (this.state.phase !== "flight" && this.state.phase !== "preflight") return;

      if (input.throttle !== undefined) {
        this.pilotInput.throttle = clamp(input.throttle, 0, 1);
      }
      if (input.pitch !== undefined) {
        this.pilotInput.pitch = clamp(input.pitch, -1, 1);
      }
      if (input.yaw !== undefined) {
        this.pilotInput.yaw = clamp(input.yaw, -1, 1);
      }
      if (input.roll !== undefined) {
        this.pilotInput.roll = clamp(input.roll, -1, 1);
      }
      if (input.stage !== undefined) {
        this.pilotInput.stage = !!input.stage;
      }
      if (input.launch !== undefined) {
        this.pilotInput.launch = this.pilotInput.launch || !!input.launch;
      }

      if (this.state.phase === "preflight" && this.vessel) {
        stepVessel(this.vessel, { ...this.pilotInput, stage: false }, PHYSICS.fixedDt);
        this.syncSnapshot();
      }
    });
  }

  onJoin(client: Client, options: LaunchOptions) {
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.name = options.playerName?.slice(0, 24) || `Pilot-${client.sessionId.slice(0, 4)}`;
    player.role = this.state.pilotSessionId ? "spectator" : "pilot";
    if (player.role === "pilot") this.state.pilotSessionId = client.sessionId;
    this.state.players.set(client.sessionId, player);
    this.state.message = `${player.name} joined`;
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) this.state.message = `${player.name} left`;
    this.state.players.delete(client.sessionId);
    if (this.state.pilotSessionId === client.sessionId) {
      const nextPilot = [...this.state.players.values()].find((p) => p.role !== "spectator") ??
        [...this.state.players.values()][0];
      if (nextPilot) {
        nextPilot.role = "pilot";
        this.state.pilotSessionId = nextPilot.sessionId;
      } else {
        this.state.pilotSessionId = "";
      }
    }
  }

  onDispose() {
    this.stopSimulation();
  }

  private beginFlight(pilotSessionId: string) {
    if (!this.vessel) {
      const craft: CraftDefinition = {
        name: this.state.craftName,
        parts: JSON.parse(this.state.craftJson),
      };
      this.vessel = createVesselOnPad(craft);
    }
    this.vessel.armed = true;
    this.pilotInput.launch = true;
    this.flightStartedAt = Date.now();
    this.state.phase = "flight";
    this.state.launched = false;
    this.state.message = "Clamps released — engines ignited";
    this.syncSnapshot();
    this.startSimulation();
    void pilotSessionId;
  }

  private startSimulation() {
    this.stopSimulation();

    if (this.state.phase === "preflight" && !this.vessel) {
      const craft: CraftDefinition = {
        name: this.state.craftName,
        parts: JSON.parse(this.state.craftJson),
      };
      this.vessel = createVesselOnPad(craft);
      this.vessel.armed = false;
      this.syncSnapshot();
    }

    this.loopHandle = setInterval(() => {
      if (!this.vessel) return;
      try {
        if (this.state.phase === "preflight") {
          const stagePulse = false;
          stepVessel(this.vessel, { ...this.pilotInput, stage: stagePulse }, PHYSICS.fixedDt);
          this.syncSnapshot();
          return;
        }

        const stagePulse = this.pilotInput.stage;
        this.pilotInput.stage = false;
        stepVessel(this.vessel, { ...this.pilotInput, stage: stagePulse }, PHYSICS.fixedDt);
        this.state.tick += 1;
        this.syncSnapshot();
        if (isFlightComplete(this.vessel)) {
          void this.finishFlight();
        }
      } catch (error) {
        console.error("Simulation step failed:", error);
        this.state.message = "Simulation error";
      }
    }, 1000 / 30);
  }

  private stopSimulation() {
    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }

  private async finishFlight() {
    if (!this.vessel) return;
    this.stopSimulation();
    const pilot = this.state.players.get(this.state.pilotSessionId);
    const log: TelemetryLog = {
      craftName: this.vessel.craft.name,
      playerName: pilot?.name ?? "Unknown",
      startedAt: this.flightStartedAt,
      endedAt: Date.now(),
      maxAltitude: this.vessel.maxAltitude,
      reachedSpace: this.vessel.reachedSpace,
      outcome: this.vessel.crashed
        ? "crash"
        : this.vessel.landed
          ? "landed"
          : this.vessel.reachedSpace
            ? "space"
            : "suborbital",
      samples: this.vessel.telemetry.filter((_, i) => i % 3 === 0),
    };
    const id = await saveTelemetryLog(log);
    this.state.lastTelemetryId = id;
    this.state.phase = this.vessel.crashed ? "crashed" : this.vessel.reachedSpace ? "space" : "landed";
    this.state.message = this.vessel.reachedSpace
      ? "Suborbital space reached — telemetry saved"
      : this.vessel.crashed
        ? "Vehicle destroyed — telemetry saved"
        : "Flight complete — telemetry saved";
  }

  private syncSnapshot() {
    if (!this.vessel) return;
    const snap = snapshotFromVessel(this.vessel);
    this.state.altitude = snap.altitude;
    this.state.velocity = snap.speed;
    this.state.verticalSpeed = snap.verticalSpeed;
    this.state.acceleration = snap.acceleration;
    this.state.dynamicPressure = snap.dynamicPressure;
    this.state.fuelRemaining = snap.fuelRemaining;
    this.state.mass = snap.mass;
    this.state.throttle = snap.throttle;
    this.state.activeStage = snap.activeStage;
    this.state.pitch = snap.pitch;
    this.state.apoapsis = snap.apoapsis ?? 0;
    this.state.periapsis = snap.periapsis ?? 0;
    this.state.inSpace = snap.inSpace;
    this.state.crashed = snap.crashed;
    this.state.landed = snap.landed;
    this.state.launched = this.state.phase === "flight" && !!this.vessel?.launched;
    this.state.posX = snap.position.x;
    this.state.posY = snap.position.y;
    this.state.posZ = snap.position.z;
    this.state.velX = snap.velocity.x;
    this.state.velY = snap.velocity.y;
    this.state.velZ = snap.velocity.z;
    this.state.rotX = snap.rotation.x;
    this.state.rotY = snap.rotation.y;
    this.state.rotZ = snap.rotation.z;
    this.state.rotW = snap.rotation.w;
    this.state.craftJson = JSON.stringify(craftToDefinition(this.vessel.craft).parts);
  }

  private resetFlightFields() {
    this.state.tick = 0;
    this.state.altitude = 0;
    this.state.velocity = 0;
    this.state.launched = false;
    this.state.crashed = false;
    this.state.landed = false;
    this.state.inSpace = false;
    this.state.lastTelemetryId = "";
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
