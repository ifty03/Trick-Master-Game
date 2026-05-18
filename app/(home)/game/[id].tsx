import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
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
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import { useAuthContext } from "@/context/AuthContext";
import { useGameSocket } from "@/hooks/useGameSocket";
import { apiFetch, ApiError } from "@/lib/api";
import { sortHand, phaseLabel } from "@/lib/gameLogic";
import type { GameState, Room, RoomPlayer } from "@/types/game";

function HandCards({
  hand,
  onPlayCard,
  playable = false,
  playingCard = false,
}: {
  hand: number[];
  onPlayCard?: (card: number) => void;
  playable?: boolean;
  playingCard?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.handCards}>
      {hand.map((card, i) => (
        <Pressable
          key={`${card}-${i}`}
          onPress={() => playable && onPlayCard?.(card)}
          disabled={!playable || playingCard}
          style={({ pressed }) => [
            styles.handCard,
            !playable && styles.handCardDisabled,
            pressed && playable && styles.handCardPressed,
            playable && styles.handCardPlayable,
          ]}
        >
          <Text style={[styles.handCardSuit, { color: i % 2 === 0 ? colors.light.destructive : colors.light.foreground }]}>
            {i % 4 === 0 ? "♠" : i % 4 === 1 ? "♥" : i % 4 === 2 ? "♣" : "♦"}
          </Text>
          <Text style={styles.handCardValue}>{card}</Text>
        </Pressable>
      ))}
      {hand.length === 0 && <Text style={styles.noCardsText}>No cards remaining</Text>}
    </ScrollView>
  );
}

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { isSocketReady } = useAuthContext();
  const insets = useSafeAreaInsets();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidInput, setBidInput] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);
  const [playingCard, setPlayingCard] = useState(false);
  const [beginningBidding, setBeginningBidding] = useState(false);

  const myUserId = user?.id ?? "";

  const fetchGame = useCallback(async () => {
    if (!id) return false;
    try {
      const [roomData, gameData] = await Promise.all([
        apiFetch<{ room: Room; players: RoomPlayer[] }>(`/rooms/${id}`),
        apiFetch<{ game_state: GameState | null; players: RoomPlayer[] }>(`/game/${id}`),
      ]);

      setRoom(roomData.room);
      setPlayers(gameData.players);
      if (gameData.game_state) {
        setGameState(gameData.game_state);
        if (gameData.game_state.phase === "finished") {
          router.replace(`/(home)/leaderboard/${id}`);
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error("fetchGame error:", e);
      return false;
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchGame();
  }, [fetchGame]);

  useEffect(() => {
    if (loading || gameState || !id) return;
    const interval = setInterval(async () => {
      const found = await fetchGame();
      if (found) clearInterval(interval);
    }, 1500);
    return () => clearInterval(interval);
  }, [loading, gameState, id, fetchGame]);

  useGameSocket("game", id, {
    onGameState: (payload) => {
      const gs = payload as GameState;
      setGameState(gs);
      if (gs.phase === "finished") {
        router.replace(`/(home)/leaderboard/${id}`);
      }
    },
    onRoomPlayers: (payload) => {
      setPlayers(payload as RoomPlayer[]);
    },
  });

  const shuffleAndDeal = async () => {
    if (!id) return;
    setBeginningBidding(true);
    try {
      const data = await apiFetch<{ game_state: GameState }>(`/game/${id}/shuffle-deal`, { method: "POST" });
      setGameState(data.game_state);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? e.message : "Failed to shuffle cards");
    } finally {
      setBeginningBidding(false);
    }
  };

  const [startingNextRound, setStartingNextRound] = useState(false);
  const startNextRound = async () => {
    if (!id) return;
    setStartingNextRound(true);
    try {
      const data = await apiFetch<{ game_state: GameState }>(`/game/${id}/next-round`, { method: "POST" });
      setGameState(data.game_state);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? e.message : "Failed to start next round");
    } finally {
      setStartingNextRound(false);
    }
  };

  const submitBid = async () => {
    const bid = parseInt(bidInput, 10);
    if (isNaN(bid) || bid < 0 || !id) return;
    setSubmittingBid(true);
    try {
      const data = await apiFetch<{ game_state: GameState }>(`/game/${id}/bid`, {
        method: "POST",
        body: JSON.stringify({ bid }),
      });
      setGameState(data.game_state);
      setBidInput("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? e.message : "Failed to submit bid");
    } finally {
      setSubmittingBid(false);
    }
  };

  const playCard = async (card: number) => {
    if (!id || playingCard) return;
    setPlayingCard(true);
    try {
      const data = await apiFetch<{ game_state: GameState }>(`/game/${id}/play`, {
        method: "POST",
        body: JSON.stringify({ card }),
      });
      setGameState(data.game_state);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? e.message : "Failed to play card");
    } finally {
      setPlayingCard(false);
    }
  };

  if (loading || !isSocketReady || !gameState) {
    return (
      <View style={styles.center}>
        <LinearGradient colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color={colors.light.gold} size="large" />
        <Text style={styles.loadingText}>Loading game...</Text>
      </View>
    );
  }

  const myPlayer = players.find((p) => p.clerk_user_id === myUserId);
  const myHand = sortHand(gameState.hands[myUserId] ?? []);
  const isMyTurn = myPlayer?.seat_order === gameState.current_turn_seat;
  const hasBid = gameState.bids[myUserId] !== null && gameState.bids[myUserId] !== undefined;
  const myCollected = gameState.tricks_collected[myUserId] ?? 0;
  const myScore = gameState.scores[myUserId] ?? 0;
  const isDealer = myPlayer?.seat_order === gameState.dealer_seat;
  const currentTurnPlayer = players.find((p) => p.seat_order === gameState.current_turn_seat);
  const dealerPlayer = players.find((p) => p.seat_order === gameState.dealer_seat);
  const showHandPanel = gameState.phase === "dealing" || gameState.phase === "bidding" || gameState.phase === "playing";

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0), paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) }]}>
      <LinearGradient colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.roundLabel}>Round {gameState.current_round}/{room?.total_rounds}</Text>
          <View style={[styles.phaseBadge, gameState.phase === "playing" && styles.phaseBadgePlaying, gameState.phase === "dealing" && styles.phaseBadgeDealing]}>
            <Text style={styles.phaseLabel}>{phaseLabel(gameState.phase)}</Text>
          </View>
        </View>
        <View style={styles.scorePill}>
          <Ionicons name="star" size={14} color={colors.light.gold} />
          <Text style={styles.scoreValue}>{myScore}</Text>
        </View>
      </View>

      <ScrollView style={styles.tableArea} contentContainerStyle={styles.tableContent}>
        <View style={styles.infoRow}>
          <View style={styles.infoBadge}>
            <Ionicons name="person" size={12} color={colors.light.gold} />
            <Text style={styles.infoText}>Dealer: {dealerPlayer?.username ?? "?"}</Text>
          </View>
          {gameState.phase !== "dealing" && (
            <View style={[styles.infoBadge, isMyTurn && styles.infoBadgeActive]}>
              <Ionicons name="sync" size={12} color={isMyTurn ? colors.light.accent : colors.light.gold} />
              <Text style={[styles.infoText, isMyTurn && { color: colors.light.accent }]}>Turn: {currentTurnPlayer?.username ?? "?"}</Text>
            </View>
          )}
        </View>

        {gameState.phase === "dealing" && (
          <View style={styles.dealingBanner}>
            <Ionicons name="shuffle" size={28} color={colors.light.gold} />
            <Text style={styles.dealingTitle}>{dealerPlayer?.username ?? "Dealer"} shuffled & dealt the cards</Text>
            <Text style={styles.dealingSubtitle}>Review your hand. Bidding starts clockwise from the dealer&apos;s left.</Text>
          </View>
        )}

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
            <View key={p.id} style={[styles.playerScoreRow, p.seat_order === gameState.current_turn_seat && gameState.phase !== "dealing" && styles.activeTurnRow]}>
              <View style={styles.playerScoreLeft}>
                <View style={[styles.seatBadge, p.seat_order === gameState.dealer_seat && styles.dealerSeatBadge, p.seat_order === gameState.current_turn_seat && gameState.phase !== "dealing" && styles.activeSeatBadge]}>
                  <Text style={[styles.seatText, p.seat_order === gameState.current_turn_seat && gameState.phase !== "dealing" && { color: colors.light.background }]}>{p.seat_order}</Text>
                </View>
                <View>
                  <Text style={styles.playerScoreName}>{p.username}{p.clerk_user_id === myUserId ? " (You)" : ""}{p.seat_order === gameState.dealer_seat ? " · Dealer" : ""}</Text>
                  <Text style={styles.playerScoreDetail}>Collected: {gameState.tricks_collected[p.clerk_user_id] ?? 0}</Text>
                </View>
              </View>
              <View style={styles.playerScoreRight}>
                {gameState.phase !== "dealing" && (
                  gameState.bids_revealed ? (
                    <View style={styles.bidBadge}><Text style={styles.bidText}>Bid: {gameState.bids[p.clerk_user_id] ?? "—"}</Text></View>
                  ) : (
                    <Text style={styles.hiddenBid}>{gameState.bids[p.clerk_user_id] !== null ? "✓" : "..."}</Text>
                  )
                )}
                <Text style={styles.totalScore}>{gameState.scores[p.clerk_user_id] ?? 0} pts</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {showHandPanel && (
        <View style={[styles.handPanel, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 12) }]}>
          <View style={styles.handHeader}>
            <Text style={styles.handTitle}>Your Hand ({myHand.length} cards)</Text>
            {gameState.phase === "playing" && (
              <View style={styles.collectedPill}><Text style={styles.collectedText}>Collected: {myCollected}</Text></View>
            )}
          </View>
          <HandCards hand={myHand} onPlayCard={playCard} playable={gameState.phase === "playing" && isMyTurn} playingCard={playingCard} />
        </View>
      )}

      {gameState.phase === "dealing" && isDealer && (
        <View style={[styles.actionPanel, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={shuffleAndDeal} disabled={beginningBidding} style={[styles.primaryBtn, beginningBidding && styles.primaryBtnDisabled]}>
            {beginningBidding ? <ActivityIndicator color={colors.light.background} size="small" /> : (
              <><Ionicons name="shuffle" size={20} color={colors.light.background} /><Text style={styles.primaryBtnText}>Shuffle Cards</Text></>
            )}
          </Pressable>
        </View>
      )}

      {gameState.phase === "dealing" && !isDealer && (
        <View style={[styles.actionPanel, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.waitingText}>Waiting for {dealerPlayer?.username ?? "dealer"} to shuffle the cards...</Text>
        </View>
      )}

      {gameState.phase === "bidding" && isMyTurn && !hasBid && (
        <View style={[styles.actionPanel, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.actionTitle}>Your turn to bid</Text>
          <View style={styles.bidRow}>
            <TextInput style={styles.bidInput} value={bidInput} onChangeText={setBidInput} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.light.mutedForeground} />
            <Pressable onPress={submitBid} disabled={submittingBid || !bidInput} style={[styles.bidBtn, (!bidInput || submittingBid) && styles.bidBtnDisabled]}>
              {submittingBid ? <ActivityIndicator color={colors.light.background} size="small" /> : <Text style={styles.bidBtnText}>Lock In</Text>}
            </Pressable>
          </View>
        </View>
      )}

      {gameState.phase === "bidding" && !isMyTurn && !hasBid && (
        <View style={[styles.actionPanel, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.waitingText}>Waiting for {currentTurnPlayer?.username ?? "next player"} to bid...</Text>
        </View>
      )}

      {gameState.phase === "bidding" && hasBid && !gameState.bids_revealed && (
        <View style={[styles.actionPanel, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.waitingText}>Bid locked in. Waiting for remaining players...</Text>
        </View>
      )}

      {gameState.phase === "playing" && isMyTurn && (
        <View style={[styles.actionPanel, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.yourTurnText}>Your turn — tap a card to play</Text>
        </View>
      )}

      {gameState.phase === "scoring" && (
        <View style={[StyleSheet.absoluteFill, styles.scoringOverlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.scoringSheet}>
            <Text style={styles.scoringTitle}>Round {gameState.current_round} Results</Text>
            
            <View style={styles.scoringTable}>
              <View style={styles.scoringHeaderRow}>
                <Text style={[styles.scoringHeaderCell, { flex: 2 }]}>Player</Text>
                <Text style={styles.scoringHeaderCell}>Bid</Text>
                <Text style={styles.scoringHeaderCell}>Won</Text>
                <Text style={styles.scoringHeaderCell}>Pts</Text>
              </View>
              {players.map(p => {
                const bid = gameState.bids[p.clerk_user_id] ?? 0;
                const won = gameState.tricks_collected[p.clerk_user_id] ?? 0;
                const pts = won >= bid ? bid : 0;
                return (
                  <View key={p.id} style={styles.scoringRow}>
                    <Text style={[styles.scoringCell, { flex: 2, fontWeight: "600" }]} numberOfLines={1}>{p.username}</Text>
                    <Text style={styles.scoringCell}>{bid}</Text>
                    <Text style={styles.scoringCell}>{won}</Text>
                    <Text style={[styles.scoringCell, { fontWeight: "700", color: pts > 0 ? colors.light.win : colors.light.mutedForeground }]}>+{pts}</Text>
                  </View>
                );
              })}
            </View>

            {room?.creator_id === myUserId ? (
              <Pressable onPress={startNextRound} disabled={startingNextRound} style={[styles.primaryBtn, { marginTop: 20 }, startingNextRound && styles.primaryBtnDisabled]}>
                {startingNextRound ? <ActivityIndicator color={colors.light.background} size="small" /> : <Text style={styles.primaryBtnText}>Start Next Round</Text>}
              </Pressable>
            ) : (
              <Text style={[styles.waitingText, { marginTop: 20 }]}>Waiting for Host to start next round...</Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.light.border },
  topBarLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  roundLabel: { fontSize: 15, fontWeight: "700", color: colors.light.gold, fontFamily: "Inter_700Bold" },
  phaseBadge: { backgroundColor: colors.light.goldGlow, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.light.goldDim },
  phaseBadgePlaying: { backgroundColor: colors.light.emeraldGlow, borderColor: colors.light.accent },
  phaseBadgeDealing: { backgroundColor: colors.light.purpleGlow, borderColor: `${colors.light.purple}40` },
  phaseLabel: { fontSize: 11, fontWeight: "600", color: colors.light.foreground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  scorePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.light.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: colors.light.border },
  scoreValue: { fontSize: 16, fontWeight: "700", color: colors.light.gold, fontFamily: "Inter_700Bold" },
  tableArea: { flex: 1 },
  tableContent: { padding: 16, gap: 16 },
  infoRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  infoBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.light.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.light.border },
  infoBadgeActive: { borderColor: colors.light.accent, backgroundColor: colors.light.emeraldGlow },
  infoText: { fontSize: 12, color: colors.light.foreground, fontFamily: "Inter_400Regular" },
  dealingBanner: { alignItems: "center", gap: 8, backgroundColor: colors.light.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.light.goldDim },
  dealingTitle: { fontSize: 16, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold", textAlign: "center" },
  dealingSubtitle: { fontSize: 13, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" },
  trickArea: { backgroundColor: colors.light.tableGreen, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#1A4030" },
  trickLabel: { fontSize: 11, fontWeight: "600", color: "#6EAB8B", fontFamily: "Inter_600SemiBold", textTransform: "uppercase", marginBottom: 14 },
  trickCards: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  trickCard: { backgroundColor: "#FFFFFF", borderRadius: 12, width: 64, height: 88, alignItems: "center", justifyContent: "center" },
  trickCardValue: { fontSize: 22, fontWeight: "700", color: "#1A1A2E", fontFamily: "Inter_700Bold" },
  trickCardPlayer: { fontSize: 9, color: "#888", marginTop: 4 },
  noTrickText: { fontSize: 13, color: "#6EAB8B", fontStyle: "italic" },
  scoresSection: { gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: "600", color: colors.light.mutedForeground, textTransform: "uppercase", letterSpacing: 1.5 },
  playerScoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.light.card, borderRadius: 14, borderWidth: 1, borderColor: colors.light.border, padding: 12 },
  activeTurnRow: { borderColor: colors.light.gold, backgroundColor: colors.light.goldGlow },
  playerScoreLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  seatBadge: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.light.muted, alignItems: "center", justifyContent: "center" },
  dealerSeatBadge: { borderWidth: 1, borderColor: colors.light.gold },
  activeSeatBadge: { backgroundColor: colors.light.gold },
  seatText: { fontSize: 12, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  playerScoreName: { fontSize: 14, fontWeight: "600", color: colors.light.foreground, fontFamily: "Inter_600SemiBold" },
  playerScoreDetail: { fontSize: 11, color: colors.light.mutedForeground },
  playerScoreRight: { alignItems: "flex-end", gap: 4 },
  bidBadge: { backgroundColor: colors.light.purpleGlow, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${colors.light.purple}40` },
  bidText: { fontSize: 11, color: colors.light.purple, fontFamily: "Inter_600SemiBold" },
  hiddenBid: { fontSize: 16, color: colors.light.mutedForeground },
  totalScore: { fontSize: 13, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  actionPanel: { backgroundColor: colors.light.card, borderTopWidth: 1, borderTopColor: colors.light.border, padding: 20, gap: 8 },
  actionTitle: { fontSize: 16, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  bidRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  bidInput: { flex: 1, backgroundColor: colors.light.input, borderWidth: 1, borderColor: colors.light.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 22, color: colors.light.foreground, fontFamily: "Inter_700Bold", textAlign: "center" },
  bidBtn: { backgroundColor: colors.light.gold, borderRadius: 12, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  bidBtnDisabled: { opacity: 0.35 },
  bidBtnText: { fontSize: 15, fontWeight: "700", color: colors.light.background, fontFamily: "Inter_700Bold" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.light.gold, borderRadius: 12, paddingVertical: 16 },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: colors.light.background, fontFamily: "Inter_700Bold" },
  waitingText: { fontSize: 14, color: colors.light.mutedForeground, textAlign: "center", paddingVertical: 8 },
  handPanel: { backgroundColor: colors.light.card, borderTopWidth: 1, borderTopColor: colors.light.border, padding: 16, gap: 10 },
  handHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  handTitle: { fontSize: 14, fontWeight: "600", color: colors.light.foreground, fontFamily: "Inter_600SemiBold" },
  collectedPill: { backgroundColor: colors.light.emeraldGlow, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: `${colors.light.win}30` },
  collectedText: { fontSize: 12, color: colors.light.win, fontFamily: "Inter_600SemiBold" },
  handCards: { gap: 10, paddingBottom: 4 },
  handCard: { backgroundColor: "#FAFAFA", borderRadius: 12, width: 60, height: 84, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E0E0E0" },
  handCardPlayable: { borderColor: colors.light.gold },
  handCardDisabled: { opacity: 0.85 },
  handCardPressed: { transform: [{ translateY: -6 }], borderColor: colors.light.accent },
  handCardSuit: { fontSize: 12, marginBottom: 2 },
  handCardValue: { fontSize: 20, fontWeight: "700", color: "#1A1A2E", fontFamily: "Inter_700Bold" },
  noCardsText: { fontSize: 13, color: colors.light.mutedForeground, fontStyle: "italic", alignSelf: "center" },
  yourTurnText: { fontSize: 13, fontWeight: "600", color: colors.light.gold, textAlign: "center", fontFamily: "Inter_600SemiBold" },
  scoringOverlay: { backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", paddingHorizontal: 20, zIndex: 100 },
  scoringSheet: { backgroundColor: colors.light.card, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: colors.light.border },
  scoringTitle: { fontSize: 20, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 20 },
  scoringTable: { gap: 8 },
  scoringHeaderRow: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.light.border },
  scoringHeaderCell: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.light.mutedForeground, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  scoringRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.light.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.light.border },
  scoringCell: { flex: 1, fontSize: 14, color: colors.light.foreground, fontFamily: "Inter_400Regular", textAlign: "center" },
});
