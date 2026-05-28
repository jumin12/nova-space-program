import { returnToKsc } from "../net/roomClient";

const COPY: Record<string, { title: string; body: string }> = {
  pad: {
    title: "Launch Complex 1",
    body: "Roll your assembled vehicle to the pad, run preflight checks, and launch when ready.",
  },
  tracking: {
    title: "Tracking Station",
    body: "Press M to open the 3D orbital map with live vessel tracking.",
  },
  rd: {
    title: "Research & Development",
    body: "Unlock parts and agency upgrades here in a future update.",
  },
  admin: {
    title: "Administration",
    body: "Agency funds, contracts, and reputation will be managed here in a future update.",
  },
  runway: {
    title: "Runway",
    body: "Aircraft and spaceplane operations will be available here in a future update.",
  },
};

export function FacilityPlaceholder({ facilityId }: { facilityId: string }) {
  const info = COPY[facilityId] ?? { title: "Facility", body: "Coming soon." };

  return (
    <div className="facility-placeholder">
      <header className="facility-placeholder-header">
        <button type="button" className="facility-back-btn" onClick={() => returnToKsc()}>
          Back to Space Center
        </button>
        <h2>{info.title}</h2>
      </header>
      <p className="facility-placeholder-body">{info.body}</p>
      {facilityId === "pad" && (
        <p className="facility-placeholder-note">Use Launch Complex from the Space Center map when your craft is ready.</p>
      )}
    </div>
  );
}
