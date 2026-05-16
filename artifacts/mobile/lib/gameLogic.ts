import type { GameState, PlayerRoundResult, RoomPlayer, TrickCard } from "@/types/game";

export function generateDeck(totalCards: number): number[] {
  const deck: number[] = [];
  for (let i = 1; i <= totalCards; i++) {
    deck.push(i * 5);
  }
  return deck;
}

export function shuffleDeck(deck: number[]): number[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(
  deck: number[],
  players: RoomPlayer[],
  cardsPerPlayer: number
): Record<string, number[]> {
  const shuffled = shuffleDeck(deck);
  const hands: Record<string, number[]> = {};

  players.forEach((player, index) => {
    hands[player.clerk_user_id] = shuffled
      .slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer)
      .sort((a, b) => a - b);
  });

  return hands;
}

export function getNextSeat(currentSeat: number, totalPlayers: number): number {
  return (currentSeat % totalPlayers) + 1;
}

export function getDealerForRound(round: number, totalPlayers: number): number {
  return ((round - 1) % totalPlayers) + 1;
}

export function getFirstPlayerSeat(dealerSeat: number, totalPlayers: number): number {
  return getNextSeat(dealerSeat, totalPlayers);
}

export function determineTrickWinner(trick: TrickCard[]): TrickCard {
  return trick.reduce((highest, card) =>
    card.card > highest.card ? card : highest
  );
}

export function calculateTrickPoints(trick: TrickCard[]): number {
  return trick.reduce((sum, card) => sum + card.card, 0);
}

export function calculateRoundResults(
  players: RoomPlayer[],
  bids: Record<string, number | null>,
  tricksCollected: Record<string, number>
): PlayerRoundResult[] {
  return players.map((player) => {
    const bid = bids[player.clerk_user_id] ?? 0;
    const collected = tricksCollected[player.clerk_user_id] ?? 0;
    const pointsEarned = collected >= bid ? bid : 0;

    return {
      clerk_user_id: player.clerk_user_id,
      username: player.username,
      bid,
      collected,
      points_earned: pointsEarned,
    };
  });
}

export function formatCardValue(value: number): string {
  return value.toString();
}

export function sortHand(hand: number[]): number[] {
  return [...hand].sort((a, b) => a - b);
}

export function allBidsSubmitted(
  bids: Record<string, number | null>,
  players: RoomPlayer[]
): boolean {
  return players.every(
    (p) => bids[p.clerk_user_id] !== undefined && bids[p.clerk_user_id] !== null
  );
}

export function allCardsPlayed(
  trick: TrickCard[],
  totalPlayers: number
): boolean {
  return trick.length === totalPlayers;
}
