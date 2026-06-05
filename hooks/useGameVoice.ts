import { useEffect, useRef } from "react";
import { speakHumanLike } from "@/lib/voiceHelper";
import type { GameState, RoomPlayer, Room } from "@/types/game";

export function useGameVoice(
  gameState: GameState | null,
  players: RoomPlayer[],
  myUserId: string,
  room: Room | null
) {
  const prevGameState = useRef<GameState | null>(null);

  useEffect(() => {
    if (!gameState) {
      prevGameState.current = null;
      return;
    }

    const prev = prevGameState.current;
    prevGameState.current = gameState;

    if (!prev) {
      // First load: speak current turn context
      if (gameState.phase === "bidding") {
        announceBidTurn(gameState, players, myUserId);
      } else if (gameState.phase === "playing") {
        announcePlayTurn(gameState, players, myUserId);
      }
      return;
    }

    // 1. Detect phase change
    if (gameState.phase !== prev.phase) {
      if (gameState.phase === "dealing") {
        const dealer = players.find((p) => p.seat_order === gameState.dealer_seat);
        const dealerName =
          dealer?.clerk_user_id === myUserId ? "You" : (dealer?.username ?? "The dealer");
        if (dealer?.clerk_user_id === myUserId) {
          speakHumanLike("Woohoo! It is your turn to shuffle and deal. Mwahaha, deal yourself some winning cards!");
        } else {
          speakHumanLike(`Aha! ${dealerName} is shuffling and dealing the cards. Let's see what luck brings!`);
        }
      } else if (gameState.phase === "bidding") {
        speakHumanLike("Bidding phase has started. Time to use your brain!");
        announceBidTurn(gameState, players, myUserId);
      } else if (gameState.phase === "playing") {
        speakHumanLike("Bidding is complete. Let the battle begin!");
        announcePlayTurn(gameState, players, myUserId);
      } else if (gameState.phase === "scoring") {
        const scoringComments: string[] = [];
        players.forEach((p) => {
          const uId = p.clerk_user_id;
          const bid = gameState.bids[uId] ?? 0;
          const won = gameState.tricks_collected[uId] ?? 0;
          const name = uId === myUserId ? "You" : p.username;
          if (won >= bid) {
            scoringComments.push(`${name} successfully made the bid of ${bid}! Woohoo!`);
          } else {
            scoringComments.push(`Oh no! ${name} missed the bid of ${bid}. Boohoo!`);
          }
        });
        speakHumanLike(`Round ${gameState.current_round} results are in. Let's look at the scores. ${scoringComments.join(" ")}`);
      } else if (gameState.phase === "finished") {
        speakHumanLike("The game is finished! Woohoo! We have a champion! Let's check out the leaderboard!");
      }
      return;
    }

    // 2. If phase is bidding, check if a new bid was submitted
    if (gameState.phase === "bidding") {
      // Check for new bids
      for (const player of players) {
        const userId = player.clerk_user_id;
        const prevBid = prev.bids[userId];
        const currBid = gameState.bids[userId];
        if (
          (prevBid === null || prevBid === undefined) &&
          currBid !== null &&
          currBid !== undefined
        ) {
          const playerName = userId === myUserId ? "You" : player.username;
          if (currBid === 0) {
            speakHumanLike(`${playerName} bid zero! Ooh, playing it safe, or a risky play?`);
          } else if (currBid >= 5) {
            speakHumanLike(`Whoa! ${playerName} bid ${currBid}! That is a bold move! Good luck!`);
          } else {
            speakHumanLike(`${playerName} bid ${currBid}.`);
          }
        }
      }

      // Check if current turn seat changed
      if (gameState.current_turn_seat !== prev.current_turn_seat) {
        announceBidTurn(gameState, players, myUserId);
      }
    }

    // 3. If phase is playing
    if (gameState.phase === "playing") {
      const prevTrick = prev.current_trick || [];
      const currTrick = gameState.current_trick || [];

      // If a card was played
      if (currTrick.length > prevTrick.length) {
        const lastPlayed = currTrick[currTrick.length - 1];
        if (lastPlayed && lastPlayed.card !== undefined) {
          const playerName = lastPlayed.clerk_user_id === myUserId ? "You" : lastPlayed.username;
          const totalCardsInGame = players.length * (room?.cards_per_player || 5);
          const maxCardVal = totalCardsInGame * 5;
          if (lastPlayed.card >= maxCardVal * 0.85) {
            speakHumanLike(`${playerName} played a massive ${lastPlayed.card}! Boom, drop the hammer!`);
          } else if (lastPlayed.card >= maxCardVal * 0.6) {
            speakHumanLike(`${playerName} played a powerful ${lastPlayed.card}! Nice one!`);
          } else if (lastPlayed.card <= 10) {
            speakHumanLike(`${playerName} played a low ${lastPlayed.card}.`);
          } else {
            speakHumanLike(`${playerName} played ${lastPlayed.card}.`);
          }
        }
      } else {
        // Trick completed: detect the last played card by the player whose turn it was
        const prevTrickCompleted = prevTrick.length > 0 && prevTrick.length === players.length - 1 && currTrick.length === 0;
        if (prevTrickCompleted) {
          const lastPlayerSeat = prev.current_turn_seat;
          const lastPlayer = players.find((p) => p.seat_order === lastPlayerSeat);
          let playedCard = 0;
          if (lastPlayer) {
            const prevHand = prev.hands[lastPlayer.clerk_user_id] || [];
            const nextHand = gameState.hands[lastPlayer.clerk_user_id] || [];
            playedCard = prevHand.find((c) => !nextHand.includes(c)) || 0;
          }

          if (lastPlayer && playedCard > 0) {
            const playerName = lastPlayer.clerk_user_id === myUserId ? "You" : lastPlayer.username;
            const totalCardsInGame = players.length * (room?.cards_per_player || 5);
            const maxCardVal = totalCardsInGame * 5;
            if (playedCard >= maxCardVal * 0.85) {
              speakHumanLike(`${playerName} played a massive ${playedCard}! Boom, drop the hammer!`);
            } else if (playedCard >= maxCardVal * 0.6) {
              speakHumanLike(`${playerName} played a powerful ${playedCard}! Nice one!`);
            } else if (playedCard <= 10) {
              speakHumanLike(`${playerName} played a low ${playedCard}.`);
            } else {
              speakHumanLike(`${playerName} played ${playedCard}.`);
            }
          }
        }
      }

      // Check if someone collected a trick (tricks_collected count increased)
      for (const player of players) {
        const userId = player.clerk_user_id;
        const prevTricks = prev.tricks_collected[userId] ?? 0;
        const currTricks = gameState.tricks_collected[userId] ?? 0;
        if (currTricks > prevTricks) {
          const playerName = userId === myUserId ? "You" : player.username;
          if (userId === myUserId) {
            speakHumanLike("Yay! You won the trick! Excellent, you are on fire!");
          } else {
            speakHumanLike(`${playerName} won the trick. Watch out!`);
          }
        }
      }

      // Check if current turn seat changed
      if (gameState.current_turn_seat !== prev.current_turn_seat) {
        announcePlayTurn(gameState, players, myUserId);
      }
    }
  }, [gameState, players, myUserId, room]);
}

function announceBidTurn(
  gameState: GameState,
  players: RoomPlayer[],
  myUserId: string
) {
  const currentBidder = players.find((p) => p.seat_order === gameState.current_turn_seat);
  if (currentBidder) {
    if (currentBidder.clerk_user_id === myUserId) {
      speakHumanLike("It is your turn to bid.");
    } else {
      speakHumanLike(`Waiting for ${currentBidder.username} to bid.`);
    }
  }
}

function announcePlayTurn(
  gameState: GameState,
  players: RoomPlayer[],
  myUserId: string
) {
  const currentTurnPlayer = players.find((p) => p.seat_order === gameState.current_turn_seat);
  if (currentTurnPlayer) {
    if (currentTurnPlayer.clerk_user_id === myUserId) {
      speakHumanLike("It is your turn to play a card.");
    } else {
      speakHumanLike(`Waiting for ${currentTurnPlayer.username} to play.`);
    }
  }
}
