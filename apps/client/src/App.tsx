import type { CSSProperties } from "react";
import { useGameBoot } from "./hooks/useGameBoot";
import { LoadingScreen } from "./ui/LoadingScreen";
import { FacilityPlaceholder } from "./ui/FacilityPlaceholder";
import { LaunchPadScreen } from "./ui/LaunchPadScreen";
import { OrbitalMapView } from "./ui/OrbitalMapView";
import { SpaceCenter } from "./ui/SpaceCenter";
import { closeOrbitalMap } from "./net/roomClient";
import { VabScreen } from "./ui/VabScreen";
import { FlightHud } from "./ui/FlightHud";
import { MainMenu } from "./ui/MainMenu";
import { GameModeSelect } from "./ui/GameModeSelect";
import { AgencyCreation } from "./ui/AgencyCreation";
import { Viewport } from "./ui/Viewport";
import { useFullscreen } from "./hooks/useFullscreen";
import { useGameStore } from "./store/gameStore";
import { getConnectionLabel } from "./ui/signalStatus";

const MENU_PHASES = new Set(["mainmenu", "connecting", "mode_select", "agency_create"]);

export function App() {
  const boot = useGameBoot();
  const phase = useGameStore((s) => s.phase);
  const connectionMode = useGameStore((s) => s.connectionMode);
  const message = useGameStore((s) => s.message);
  const agency = useGameStore((s) => s.agency);
  const facilityScreen = useGameStore((s) => s.facilityScreen);
  const mapOpen = useGameStore((s) => s.mapOpen);

  const mainMenuMode = MENU_PHASES.has(phase);
  const flightMode = phase === "flight" || phase === "preflight";
  const vabMode = phase === "build";
  const kscMode = phase === "lobby" || phase === "space" || phase === "landed" || phase === "crashed";

  const { enter: enterFullscreen } = useFullscreen();

  if (!boot.ready) {
    return (
      <LoadingScreen
        stage={boot.stage}
        progress={boot.progress}
        error={boot.error}
        onRetry={boot.error ? boot.retry : undefined}
      />
    );
  }

  return (
    <div
      className={`app-shell ${mainMenuMode ? "main-menu-mode" : ""} ${phase === "preflight" ? "preflight-mode" : ""} ${flightMode ? "flight-mode" : ""} ${vabMode ? "vab-mode" : ""} ${kscMode ? "ksc-mode" : ""}`}
      style={
        agency
          ? ({ "--agency-primary": agency.primaryColor, "--agency-secondary": agency.secondaryColor } as CSSProperties)
          : undefined
      }
    >
      <div className="game-layer">
        {!mainMenuMode && (
          <header className="top-bar">
            <div className="top-bar-brand">
              {agency && <span className="agency-emblem-sm">{agency.emblem}</span>}
              <h1>{agency?.name ?? "Orbital Frontier"}</h1>
            </div>
            <div className="top-bar-meta">
              {agency && (
                <span className="agency-funds">
                  {agency.gameMode === "sandbox" ? "∞" : `§${agency.funds.toLocaleString()}`}
                </span>
              )}
              <span className={`status-pill status-${connectionMode}`}>
                {getConnectionLabel(connectionMode)}
              </span>
              <span className="top-message">{message}</span>
            </div>
          </header>
        )}

        <div className="viewport-container">
          <Viewport />
          {flightMode && <FlightHud />}
        </div>
      </div>

      <div className={`ui-layer${mainMenuMode ? " ui-layer-menu" : ""}`}>
        {phase === "mainmenu" && (
          <div className="screen-overlay menu-overlay">
            <MainMenu onRequestFullscreen={() => void enterFullscreen()} />
          </div>
        )}
        {phase === "mode_select" && (
          <div className="screen-overlay menu-overlay">
            <GameModeSelect />
          </div>
        )}
        {phase === "agency_create" && (
          <div className="screen-overlay menu-overlay">
            <AgencyCreation />
          </div>
        )}
        {phase === "connecting" && (
          <div className="screen-overlay menu-overlay connecting-overlay">
            <div className="connecting-card">
              <h2>Connecting to Kerbin…</h2>
              <p>{message}</p>
            </div>
          </div>
        )}

        {kscMode && !flightMode && (
          <div className="screen-overlay ksc-overlay">
            {facilityScreen === "pad" ? (
              <LaunchPadScreen />
            ) : facilityScreen ? (
              <FacilityPlaceholder facilityId={facilityScreen} />
            ) : (
              <SpaceCenter />
            )}
          </div>
        )}

        {mapOpen && (
          <div className="screen-overlay map-overlay-layer">
            <OrbitalMapView onClose={() => closeOrbitalMap()} />
          </div>
        )}

        {vabMode && !flightMode && (
          <div className="screen-overlay vab-overlay">
            <VabScreen />
          </div>
        )}
      </div>
    </div>
  );
}
