import { Schema, type, MapSchema } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") sessionId = "";
  @type("string") name = "";
  @type("string") role = "spectator";
  @type("boolean") ready = false;
}

export class LaunchRoomState extends Schema {
  @type("string") phase = "lobby";
  @type("string") pilotSessionId = "";
  @type("string") craftName = "Sounding Rocket Mk1";
  @type("string") craftJson = "[]";
  @type("number") tick = 0;
  @type("number") altitude = 0;
  @type("number") velocity = 0;
  @type("number") verticalSpeed = 0;
  @type("number") acceleration = 0;
  @type("number") dynamicPressure = 0;
  @type("number") fuelRemaining = 0;
  @type("number") mass = 0;
  @type("number") throttle = 0;
  @type("number") activeStage = 1;
  @type("number") pitch = 0;
  @type("number") apoapsis = 0;
  @type("number") periapsis = 0;
  @type("boolean") inSpace = false;
  @type("boolean") launched = false;
  @type("boolean") crashed = false;
  @type("boolean") landed = false;
  @type("number") posX = 600000;
  @type("number") posY = 0;
  @type("number") posZ = 0;
  @type("number") velX = 0;
  @type("number") velY = 0;
  @type("number") velZ = 0;
  @type("number") rotX = 0;
  @type("number") rotY = 0;
  @type("number") rotZ = 0;
  @type("number") rotW = 1;
  @type("string") lastTelemetryId = "";
  @type("string") message = "Welcome to Orbital Frontier";
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
