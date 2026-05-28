export type GameMode = "sandbox" | "career" | "science";

export type AgencyProfile = {
  id: string;
  name: string;
  motto: string;
  emblem: string;
  primaryColor: string;
  secondaryColor: string;
  gameMode: GameMode;
  funds: number;
  science: number;
  reputation: number;
  createdAt: number;
};

export const GAME_MODES: { id: GameMode; name: string; desc: string }[] = [
  { id: "career", name: "Career", desc: "Science, funding, contracts, and progression." },
  { id: "science", name: "Science", desc: "All facilities unlocked. Focus on experiments." },
  { id: "sandbox", name: "Sandbox", desc: "Unlimited funds. All parts. Pure creativity." },
];

/** Text-based agency insignia codes (no emoji). */
export const AGENCY_EMBLEMS = ["KSA", "ORB", "LUN", "STR", "SKY", "KRB", "VAF", "FLD"] as const;

export const AGENCY_COLORS = [
  { primary: "#e87040", secondary: "#2a7fd4" },
  { primary: "#6fcf6f", secondary: "#1a5fb4" },
  { primary: "#c85028", secondary: "#ffd67a" },
  { primary: "#9b59b6", secondary: "#5b9bd5" },
  { primary: "#e74c3c", secondary: "#34495e" },
  { primary: "#1abc9c", secondary: "#2c3e50" },
] as const;

export function createAgency(input: {
  name: string;
  motto: string;
  emblem: string;
  primaryColor: string;
  secondaryColor: string;
  gameMode: GameMode;
}): AgencyProfile {
  const startingFunds = input.gameMode === "sandbox" ? 999_999_999 : input.gameMode === "science" ? 500_000 : 50_000;
  return {
    id: `agency-${Date.now().toString(36)}`,
    name: input.name.slice(0, 32),
    motto: input.motto.slice(0, 64),
    emblem: input.emblem,
    primaryColor: input.primaryColor,
    secondaryColor: input.secondaryColor,
    gameMode: input.gameMode,
    funds: startingFunds,
    science: 0,
    reputation: 0,
    createdAt: Date.now(),
  };
}
