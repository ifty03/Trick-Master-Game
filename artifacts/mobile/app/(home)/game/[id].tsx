import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUser } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import { useAuthContext } from "@/context/AuthContext";
import {
  determineTrickWinner,
  calculateTrickPoints,
  calculateRoundResults,
  getDealerForRound,
  getFirstPlayerSeat,
  dealCards,
  generateDeck,
  sortHand,
  allBidsSubmitted,
  allCardsPlayed,
} from "@/lib/gameLogic";
import type { GameState, Room, RoomPlayer, TrickCard } from "@/types/game";

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { getClient } = useAuthContext();
  const insets = useSafeAreaInsets();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidInput, setBidInput] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);
  const [playingCard, setPlayingCard] = useState(false);
  const gameStateId = useRef<string | null>(null);

  const myUserId = user?.id ?? "";

  const fetchGame = useCallback(async () => {
    if (!id) return;
    try {
      const client = getClient();
      const [roomRes, playersRes, gsRes] = await Promise.all([
        client.from("rooms").select("*").eq("id", id).single(),
        client.from("room_players").select("*").eq("room_id", id).order("seat_order"),
        client.from("game_states").select("*").eq("room_id", id).single(),
      ]);

      if (roomRes.data) setRoom(roomRes.data as Room);
      if (playersRes.data) setPlayers(playersRes.data as RoomPlayer[]);
      if (gsRes.data) {
        setGameState(gsRes.data as GameState);
        gameStateId.current = gsRes.data.id;
      }
    } catch (e) {
      console.error("fetchGame error:", e);
    } finally {
      setLoading(false);
    }
  }, [id, getClient]);

  useEffect(() => {
    fetchGame();
    const client = getClient();
    const channel = client
      .channel(`game-${id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "game_states",
        filter: `room_id=eq.${id}`,
      }, (payload) => {
        setGameState(payload.new as GameState);
        if ((payload.new as GameState).phase === "finished") {
          router.replace(`/(home)/leaderboard/${id}`);
        }
      })
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, [id, fetchGame]);

  const submitBid = async () => {
    const bid = parseInt(bidInput);
    if (isNaN(bid) || bid < 0 || !gameState) return;
    setSubmittingBid(true);
    try {
      const client = getClient();
      const updatedBids = { ...gameState.bids, [myUserId]: bid };
      const allSubmitted = allBidsSubmitted(updatedBids, players);

      await client
        .from("game_states")
        .update({
          bids: updatedBids,
          bids_revealed: allSubmitted,
        })
        .eq("id", gameState.id);

      setBidInput("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Alert.alert("Error", "Failed to submit bid.");
    } finally {
      setSubmittingBid(false);
    }
  };

  const playCard = async (card: number) => {
    if (!gameState || !user || playingCard) return;
    const myPlayer = players.find((p) => p.clerk_user_id === myUserId);
    if (!myPlayer) return;
    if (gameState.current_turn_seat !== myPlayer.seat_order) {
      Alert.alert("Not your turn", "Wait for your turn to play a card.");
      return;
    }

    setPlayingCard(true);
    try {
      const client = getClient();
      const newTrick: TrickCard[] = [
        ...gameState.current_trick,
        { clerk_user_id: myUserId, username: myPlayer.username, seat_order: myPlayer.seat_order, card },
      ];
      const newHand = gameState.hands[myUserId].filter((c) => c !== card);
      const newHands = { ...gameState.hands, [myUserId]: newHand };

      let updates: Partial<GameState> = {
        current_trick: newTrick,
        hands: newHands,
      };

      if (allCardsPlayed(newTrick, players.length)) {
        const winner = determineTrickWinner(newTrick);
        const points = calculateTrickPoints(newTrick);
        const newTricksCollected = {
          ...gameState.tricks_collected,
          [winner.clerk_user_id]: (gameState.tricks_collected[winner.clerk_user_id] ?? 0) + points,
        };

        const isLastTrick = newHand.length === 0;

        if (isLastTrick) {
          const results = calculateRoundResults(players, gameState.bids, newTricksCollected);
          const newScores = { ...gameState.scores };
          results.forEach((r) => {
            newScores[r.clerk_user_id] = (newScores[r.clerk_user_id] ?? 0) + r.points_earned;
          });

          const isLastRound = gameState.current_round >= (room?.total_rounds ?? 1);
          if (isLastRound) {
            updates = {
              ...updates,
              tricks_collected: newTricksCollected,
              current_trick: [],
              scores: newScores,
              phase: "finished",
            };
          } else {
            const nextRound = gameState.current_round + 1;
            const newDealerSeat = getDealerForRound(nextRound, players.length);
            const newFirstSeat = getFirstPlayerSeat(newDealerSeat, players.length);
            const totalCards = players.length * (room?.cards_per_player ?? 10);
            const deck = generateDeck(totalCards);
            const newHands = dealCards(deck, players, room?.cards_per_player ?? 10);
            const resetBids: Record<string, null> = {};
            const resetTricks: Record<string, number> = {};
            players.forEach((p) => {
              resetBids[p.clerk_user_id] = null;
              resetTricks[p.clerk_user_id] = 0;
            });

            updates = {
              current_round: nextRound,
              dealer_seat: newDealerSeat,
              current_turn_seat: newFirstSeat,
              phase: "bidding",
              hands: newHands,
              bids: resetBids,
              bids_revealed: false,
              tricks_collected: resetTricks,
              current_trick: [],
              scores: newScores,
            };
            await client.from("rooms").update({ current_round: nextRound }).eq("id", id);
          }
        } else {
          updates = {
            ...updates,
            tricks_collected: newTricksCollected,
            current_trick: [],
            current_turn_seat: winner.seat_order,
          };
        }
      } else {
        const nextSeat =
          (newTrick[newTrick.length - 1].seat_order % players.length) + 1;
        updates.current_turn_seat = nextSeat;
      }

      await client.from("game_states").update(updates).eq("id", gameState.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      console.error("playCard error:", e);
      Alert.alert("Error", "Failed to play card.");
    } finally {
      setPlayingCard(false);
    }
  };

  if (loading || !gameState) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.light.gold} size="large" />
      </View>
    );
  }

  const myPlayer = players.find((p) => p.clerk_user_id === myUserId);
  const myHand = sortHand(gameState.hands[myUserId] ?? []);
  const isMyTurn = myPlayer?.seat_order === gameState.current_turn_seat;
  const hasBid = gameState.bids[myUserId] !== null && gameState.bids[myUserId] !== undefined;
  const myCollected = gameState.tricks_collected[myUserId] ?? 0;
  const myScore = gameState.scores[myUserId] ?? 0;

  const currentTurnPlayer = players.find((p) => p.seat_order === gameState.current_turn_seat);
  const dealerPlayer = players.find((p) => p.seat_order === gameState.dealer_seat);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0), paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) }]}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.roundLabel}>Round {gameState.current_round}/{room?.total_rounds}</Text>
          <Text style={styles.phaseLabel}>{gameState.phase === "bidding" ? "Bidding" : "Playing"}</Text>
        </View>
        <View style={styles.topBarRight}>
          <Text style={styles.scoreLabel}>Score: <Text style={styles.scoreValue}>{myScore}</Text></Text>
        </View>
      </View>

      <ScrollView style={styles.tableArea} contentContainerStyle={styles.tableContent}>
        <View style={styles.infoRow}>
          <View style={styles.infoBadge}>
            <Ionicons name="person" size={12} color={colors.light.gold} />
            <Text style={styles.infoText}>Dealer: {dealerPlayer?.username ?? "?"}</Text>
          </View>
          <View style={styles.infoBadge}>
            <Ionicons name="sync" size={12} color={colors.light.gold} />
            <Text style={styles.infoText}>Turn: {currentTurnPlayer?.username ?? "?"}</Text>
          </View>
        </View>

        {gameState.phase === "playing" && (
          <View style={styles.trickArea}>
            <Text style={styles.trickLabel}>Current Trick</Text>
            <View style={styles.trickCards}>
              {gameState.current_trick.length === 0 ? (
                <Text style={styles.noTrickText}>No cards played yet</Text>
              ) : (
                gameState.current_trick.map((tc, i) => (
                  <View key={i} style={styles.trickCard}>
                    <Text style={styles.trickCardValue}>{tc.card}</Text>
                    <Text style={styles.trickCardPlayer}>{tc.username}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        <View style={styles.scoresSection}>
          <Text style={styles.sectionLabel}>Players</Text>
          {players.map((p) => (
            <View key={p.id} style={[styles.playerScoreRow, p.seat_order === gameState.current_turn_seat && styles.activeTurnRow]}>
              <View style={styles.playerScoreLeft}>
                <View style={[styles.seatBadge, p.seat_order === gameState.current_turn_seat && styles.activeSeatBadge]}>
                  <Text style={styles.seatText}>{p.seat_order}</Text>
                </View>
                <View>
                  <Text style={styles.playerScoreName}>
                    {p.username}{p.clerk_user_id === myUserId ? " (You)" : ""}
                  </Text>
                  <Text style={styles.playerScoreDetail}>
                    Collected: {gameState.tricks_collected[p.clerk_user_id] ?? 0}
                  </Text>
                </View>
              </View>
              <View style={styles.playerScoreRight}>
                {gameState.bids_revealed ? (
                  <View style={styles.bidBadge}>
                    <Text style={styles.bidText}>
                      Bid: {gameState.bids[p.clerk_user_id] ?? "—"}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.hiddenBid}>
                    {gameState.bids[p.clerk_user_id] !== null ? "✓" : "..."}
                  </Text>
                )}
                <Text style={styles.totalScore}>{gameState.scores[p.clerk_user_id] ?? 0} pts</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {gameState.phase === "bidding" && !hasBid && (
        <View style={[styles.actionPanel, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.actionTitle}>Submit your bid</Text>
          <Text style={styles.actionSubtitle}>You have {myHand.length} cards</Text>
          <View style={styles.bidRow}>
            <TextInput
              style={styles.bidInput}
              value={bidInput}
              onChangeText={setBidInput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.light.mutedForeground}
            />
            <Pressable
              onPress={submitBid}
              disabled={submittingBid || !bidInput}
              style={({ pressed }) => [
                styles.bidBtn,
                (!bidInput || submittingBid) && styles.bidBtnDisabled,
                pressed && { opacity: 0.8 },
              ]}
            >
              {submittingBid ? (
                <ActivityIndicator color={colors.light.background} size="small" />
              ) : (
                <Text style={styles.bidBtnText}>Lock In</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {gameState.phase === "bidding" && hasBid && (
        <View style={[styles.actionPanel, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.waitingText}>Bid submitted. Waiting for others...</Text>
        </View>
      )}

      {gameState.phase === "playing" && (
        <View style={[styles.handPanel, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 12) }]}>
          <View style={styles.handHeader}>
            <Text style={styles.handTitle}>Your Hand</Text>
            <Text style={styles.collectedText}>Collected: {myCollected}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.handCards}>
            {myHand.map((card, i) => (
              <Pressable
                key={i}
                onPress={() => playCard(card)}
                disabled={!isMyTurn || playingCard}
                style={({ pressed }) => [
                  styles.handCard,
                  !isMyTurn && styles.handCardDisabled,
                  pressed && isMyTurn && styles.handCardPressed,
                ]}
              >
                <Text style={styles.handCardValue}>{card}</Text>
              </Pressable>
            ))}
            {myHand.length === 0 && (
              <Text style={styles.noCardsText}>No cards remaining</Text>
            )}
          </ScrollView>
          {isMyTurn && <Text style={styles.yourTurnText}>Your turn — tap a card to play</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.light.background },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
  },
  topBarLeft: {},
  topBarRight: {},
  roundLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.light.gold,
    fontFamily: "Inter_700Bold",
  },
  phaseLabel: {
    fontSize: 12,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
    textTransform: "capitalize",
  },
  scoreLabel: {
    fontSize: 14,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
  },
  scoreValue: {
    color: colors.light.gold,
    fontFamily: "Inter_700Bold",
  },
  tableArea: { flex: 1 },
  tableContent: { padding: 16, gap: 16 },
  infoRow: { flexDirection: "row", gap: 8 },
  infoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.light.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  infoText: {
    fontSize: 12,
    color: colors.light.foreground,
    fontFamily: "Inter_400Regular",
  },
  trickArea: {
    backgroundColor: colors.light.tableGreen,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2D5A3E",
  },
  trickLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A8C5B5",
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  trickCards: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  trickCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    width: 60,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  trickCardValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A2E",
    fontFamily: "Inter_700Bold",
  },
  trickCardPlayer: {
    fontSize: 9,
    color: "#666",
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  noTrickText: {
    fontSize: 13,
    color: "#A8C5B5",
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  scoresSection: { gap: 8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.light.mutedForeground,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  playerScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.light.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
  },
  activeTurnRow: {
    borderColor: colors.light.gold,
    backgroundColor: "#1E1A0A",
  },
  playerScoreLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  seatBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.light.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  activeSeatBadge: { backgroundColor: colors.light.gold },
  seatText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  playerScoreName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.light.foreground,
    fontFamily: "Inter_600SemiBold",
  },
  playerScoreDetail: {
    fontSize: 11,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
  },
  playerScoreRight: { alignItems: "flex-end", gap: 4 },
  bidBadge: {
    backgroundColor: colors.light.muted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bidText: {
    fontSize: 11,
    color: colors.light.gold,
    fontFamily: "Inter_600SemiBold",
  },
  hiddenBid: {
    fontSize: 16,
    color: colors.light.mutedForeground,
  },
  totalScore: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  actionPanel: {
    backgroundColor: colors.light.card,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
    padding: 20,
    gap: 8,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  actionSubtitle: {
    fontSize: 13,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
  },
  bidRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  bidInput: {
    flex: 1,
    backgroundColor: colors.light.input,
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 20,
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  bidBtn: {
    backgroundColor: colors.light.gold,
    borderRadius: 10,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  bidBtnDisabled: { opacity: 0.4 },
  bidBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.light.background,
    fontFamily: "Inter_700Bold",
  },
  waitingText: {
    fontSize: 14,
    color: colors.light.mutedForeground,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    paddingVertical: 8,
  },
  handPanel: {
    backgroundColor: colors.light.card,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
    padding: 16,
    gap: 10,
  },
  handHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  handTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.light.foreground,
    fontFamily: "Inter_600SemiBold",
  },
  collectedText: {
    fontSize: 13,
    color: colors.light.win,
    fontFamily: "Inter_600SemiBold",
  },
  handCards: {
    gap: 10,
    paddingBottom: 4,
  },
  handCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    width: 56,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  handCardDisabled: { opacity: 0.5 },
  handCardPressed: {
    transform: [{ translateY: -4 }],
    shadowOpacity: 0.4,
  },
  handCardValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
    fontFamily: "Inter_700Bold",
  },
  noCardsText: {
    fontSize: 13,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    alignSelf: "center",
  },
  yourTurnText: {
    fontSize: 12,
    color: colors.light.gold,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
  },
});
