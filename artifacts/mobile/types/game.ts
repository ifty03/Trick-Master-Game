export type RoomStatus = "waiting" | "playing" | "finished";
export type GamePhase = "bidding" | "playing" | "scoring" | "finished";

export interface Profile {
  id: string;
  clerk_user_id: string;
  username: string;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  creator_id: string;
  status: RoomStatus;
  cards_per_player: number;
  total_rounds: number;
  current_round: number;
  created_at: string;
  room_players?: RoomPlayer[];
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  clerk_user_id: string;
  username: string;
  seat_order: number;
  joined_at: string;
}

export interface GameState {
  id: string;
  room_id: string;
  current_round: number;
  dealer_seat: number;
  current_turn_seat: number;
  phase: GamePhase;
  hands: Record<string, number[]>;
  bids: Record<string, number | null>;
  bids_revealed: boolean;
  tricks_collected: Record<string, number>;
  current_trick: TrickCard[];
  scores: Record<string, number>;
  updated_at: string;
}

export interface TrickCard {
  clerk_user_id: string;
  username: string;
  seat_order: number;
  card: number;
}

export interface RoundHistory {
  id: string;
  room_id: string;
  round: number;
  player_results: PlayerRoundResult[];
  created_at: string;
}

export interface PlayerRoundResult {
  clerk_user_id: string;
  username: string;
  bid: number;
  collected: number;
  points_earned: number;
}

export interface LeaderboardEntry {
  clerk_user_id: string;
  username: string;
  total_score: number;
  rank: number;
}
