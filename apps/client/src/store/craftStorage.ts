import type { CraftDefinition } from "@orbital/common";
import { DEFAULT_CRAFT } from "@orbital/common";

export type SavedRocket = {
  id: string;
  name: string;
  craft: CraftDefinition;
  updatedAt: number;
};

const STORAGE_KEY = "orbital-saved-rockets";

export function loadSavedRockets(): SavedRocket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [defaultSavedRocket()];
    const parsed = JSON.parse(raw) as SavedRocket[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [defaultSavedRocket()];
    return parsed;
  } catch {
    return [defaultSavedRocket()];
  }
}

export function persistSavedRockets(rockets: SavedRocket[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rockets));
}

export function defaultSavedRocket(): SavedRocket {
  return {
    id: "default-mk1",
    name: DEFAULT_CRAFT.name,
    craft: DEFAULT_CRAFT,
    updatedAt: Date.now(),
  };
}

export function createSavedRocket(name: string, craft: CraftDefinition): SavedRocket {
  return {
    id: `rocket-${Date.now().toString(36)}`,
    name,
    craft,
    updatedAt: Date.now(),
  };
}
