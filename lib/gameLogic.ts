import type { GameState, PlayerRoundResult, RoomPlayer, TrickCard } from "@/types/game";

export function sortHand(hand: number[]): number[] {
  return [...hand].sort((a, b) => a - b);
}

export function phaseLabel(phase: GameState["phase"]): string {
  switch (phase) {
    case "dealing":
      return "Dealing";
    case "bidding":
      return "Bidding";
    case "playing":
      return "Playing";
    case "scoring":
      return "Scoring";
    case "finished":
      return "Finished";
    default:
      return phase;
  }
}

export type { TrickCard, PlayerRoundResult, RoomPlayer };
