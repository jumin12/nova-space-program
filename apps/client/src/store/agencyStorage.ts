import type { AgencyProfile } from "@orbital/common";

const KEY = "orbital-agency";

export function loadAgency(): AgencyProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AgencyProfile;
  } catch {
    return null;
  }
}

export function saveAgency(agency: AgencyProfile) {
  localStorage.setItem(KEY, JSON.stringify(agency));
}

export function clearAgency() {
  localStorage.removeItem(KEY);
}
