import React, { useState, useEffect, useCallback, useRef } from "react";
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
  KeyboardAvoidingView,
  AppState,
  Modal,
  Animated,
  Image,
} from "react-native";
import { BlurView } from "expo-blur";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useUser } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import { useAuthContext } from "@/context/AuthContext";
import { useGameSocket } from "@/hooks/useGameSocket";
import { useGameVoice } from "@/hooks/useGameVoice";
import { useVoiceSettings } from "@/lib/voiceHelper";
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
  const suits = ["♠", "♥", "♣", "♦"];
  const suitColors = [colors.light.foreground, colors.light.destructive, colors.light.foreground, colors.light.destructive];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.handCards}>
      {hand.map((card, i) => {
        const suitIdx = i % 4;
        return (
          <Pressable
            key={`${card}-${i}`}
            onPress={() => playable && onPlayCard?.(card)}
            disabled={!playable || playingCard}
            style={({ pressed }) => [
              styles.handCard,
              i > 0 && { marginLeft: -10 },
              !playable && styles.handCardDisabled,
              pressed && playable && styles.handCardPressed,
              playable && styles.handCardPlayable,
            ]}
          >
            <Text style={[styles.handCardCornerSuit, { color: suitColors[suitIdx] }]}>{suits[suitIdx]}</Text>
            <Text style={styles.handCardValue}>{card}</Text>
            <Text style={[styles.handCardBottomSuit, { color: suitColors[suitIdx] }]}>{suits[suitIdx]}</Text>
          </Pressable>
        );
      })}
      {hand.length === 0 && <Text style={styles.noCardsText}>No cards remaining</Text>}
    </ScrollView>
  );
}

interface AnimatedEmojiProps {
  char: string;
  delay: number;
  startX: number;
}

function FloatingEmoji({ char, delay, startX }: AnimatedEmojiProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animatedValue, delay]);

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [300, -300],
  });

  const opacity = animatedValue.interpolate({
    inputRange: [0, 0.1, 0.8, 1],
    outputRange: [0, 1, 1, 0],
  });

  const scale = animatedValue.interpolate({
    inputRange: [0, 0.15, 1],
    outputRange: [0.4, 1.2, 0.7],
  });

  const translateX = animatedValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, startX % 2 === 0 ? 40 : -40, startX % 2 === 0 ? -20 : 20],
  });

  return (
    <Animated.Text
      style={{
        position: "absolute",
        left: startX,
        bottom: 120,
        fontSize: 36,
        opacity,
        transform: [{ translateY }, { translateX }, { scale }],
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      {char}
    </Animated.Text>
  );
}

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useUser();
  const { isSocketReady } = useAuthContext();
  const insets = useSafeAreaInsets();
  const { isMuted, setMuted } = useVoiceSettings();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidInput, setBidInput] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);
  const [playingCard, setPlayingCard] = useState(false);
  const [beginningBidding, setBeginningBidding] = useState(false);

  const [emojiBursts, setEmojiBursts] = useState<{ id: string; char: string; startX: number; delay: number }[]>([]);

  const triggerEmojiBurst = useCallback((chars: string[]) => {
    const newBursts = Array.from({ length: 12 }).map((_, idx) => ({
      id: Math.random().toString(),
      char: chars[idx % chars.length],
      startX: 60 + Math.random() * 240,
      delay: Math.random() * 600,
    }));
    setEmojiBursts((prev) => [...prev, ...newBursts]);

    setTimeout(() => {
      setEmojiBursts((prev) => prev.slice(newBursts.length));
    }, 2800);
  }, []);

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

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        console.log("[GameScreen] App resumed to foreground, fetching state...");
        fetchGame();
      }
    });
    return () => subscription.remove();
  }, [fetchGame]);

  const [quitModalVisible, setQuitModalVisible] = useState(false);
  const [quitAction, setQuitAction] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (!gameState || gameState.phase === "finished") {
        return;
      }

      e.preventDefault();
      setQuitAction(e.data.action);
      setQuitModalVisible(true);
    });

    return unsubscribe;
  }, [navigation, gameState]);

  const confirmQuit = async () => {
    setQuitModalVisible(false);
    if (id) {
      try {
        await apiFetch(`/rooms/${id}/leave`, { method: "DELETE" });
      } catch (err) {
        console.error("Error leaving room on quit:", err);
      }
    }
    if (quitAction) {
      navigation.dispatch(quitAction);
    }
  };

  const prevGameStateRef = useRef<GameState | null>(null);

  useEffect(() => {
    if (!gameState) {
      prevGameStateRef.current = null;
      return;
    }

    const prev = prevGameStateRef.current;
    prevGameStateRef.current = gameState;

    if (!prev) return;

    // 1. Phase transition emoji pops
    if (gameState.phase !== prev.phase) {
      if (gameState.phase === "bidding") {
        triggerEmojiBurst(["🤔", "🧠", "🔮"]);
      } else if (gameState.phase === "playing") {
        triggerEmojiBurst(["🃏", "✨", "🚀"]);
      } else if (gameState.phase === "scoring") {
        const myBid = gameState.bids[myUserId] ?? 0;
        const myWon = gameState.tricks_collected[myUserId] ?? 0;
        if (myWon >= myBid) {
          triggerEmojiBurst(["🎉", "🥳", "👑", "📈", "🌟"]);
        } else {
          triggerEmojiBurst(["😭", "💔", "😢", "📉"]);
        }
      } else if (gameState.phase === "dealing") {
        triggerEmojiBurst(["🃏", "✨", "🎲"]);
      }
      return;
    }

    // 2. High card plays
    const prevTrick = prev.current_trick || [];
    const currTrick = gameState.current_trick || [];
    if (currTrick.length > prevTrick.length) {
      const lastPlayed = currTrick[currTrick.length - 1];
      if (lastPlayed && lastPlayed.card !== undefined) {
        const totalCardsInGame = players.length * (room?.cards_per_player || 5);
        const maxCardVal = totalCardsInGame * 5;
        if (lastPlayed.card >= maxCardVal * 0.75) {
          triggerEmojiBurst(["⚡", "💥", "😎"]);
        }
      }
    }

    // 3. Trick won
    for (const player of players) {
      const uId = player.clerk_user_id;
      const prevTricks = prev.tricks_collected[uId] ?? 0;
      const currTricks = gameState.tricks_collected[uId] ?? 0;
      if (currTricks > prevTricks) {
        if (uId === myUserId) {
          triggerEmojiBurst(["🏆", "🔥", "👑", "👏", "🥳"]);
        } else {
          triggerEmojiBurst(["👏", "👍"]);
        }
      }
    }
  }, [gameState, players, myUserId, triggerEmojiBurst]);

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

  useGameVoice(gameState, players, myUserId, room);

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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}
    >
      <LinearGradient colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.exitBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="close" size={18} color={colors.light.destructive} />
          </Pressable>
          <Text style={styles.roundLabel}>Round {gameState.current_round}/{room?.total_rounds}</Text>
          <View style={[styles.phaseBadge, gameState.phase === "playing" && styles.phaseBadgePlaying, gameState.phase === "dealing" && styles.phaseBadgeDealing]}>
            <Text style={styles.phaseLabel}>{phaseLabel(gameState.phase)}</Text>
          </View>
        </View>
        <View style={styles.topBarRight}>
          <Pressable
            onPress={() => setMuted(!isMuted)}
            style={({ pressed }) => [
              styles.muteButton,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons
              name={isMuted ? "volume-mute" : "volume-high"}
              size={18}
              color={isMuted ? colors.light.mutedForeground : colors.light.gold}
            />
          </Pressable>
          <View style={styles.scorePill}>
            <Ionicons name="star" size={14} color={colors.light.gold} />
            <Text style={styles.scoreValue}>{myScore}</Text>
          </View>
        </View>
      </View>

      {/* Compact horizontal opponent bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.opponentBar} contentContainerStyle={styles.opponentBarContent}>
        {players.map((p) => {
          const isActive = p.seat_order === gameState.current_turn_seat && gameState.phase !== "dealing";
          const isMe = p.clerk_user_id === myUserId;
          const isPlayerDealer = p.seat_order === gameState.dealer_seat;
          const playerBid = gameState.bids[p.clerk_user_id];
          const playerCollected = gameState.tricks_collected[p.clerk_user_id] ?? 0;

          return (
            <View key={p.id} style={[styles.opponentChip, isActive && styles.opponentChipActive, isMe && styles.opponentChipMe]}>
              <View style={[styles.opponentAvatar, isActive && styles.opponentAvatarActive]}>
                {p.avatar_url ? (
                  <Image source={{ uri: p.avatar_url }} style={{ width: "100%", height: "100%", borderRadius: 18 }} />
                ) : (
                  <Text style={[styles.opponentAvatarText, isActive && { color: colors.light.background }]}>{p.username.charAt(0).toUpperCase()}</Text>
                )}
                {isPlayerDealer && (
                  <View style={styles.dealerDot}>
                    <Text style={styles.dealerDotText}>D</Text>
                  </View>
                )}
              </View>
              <View style={styles.opponentInfo}>
                <Text style={styles.opponentName} numberOfLines={1}>{isMe ? "You" : p.username}</Text>
                <View style={styles.opponentSubRow}>
                  <Text style={styles.opponentScore}>{gameState.scores[p.clerk_user_id] ?? 0} pts</Text>
                  {gameState.phase !== "dealing" && (
                    <Text style={styles.opponentBidStatus}>
                      {gameState.bids_revealed
                        ? `Bid: ${playerBid ?? "—"} (Won: ${playerCollected})`
                        : playerBid !== null ? `✓ (${playerCollected})` : `… (${playerCollected})`}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Central felt table area */}
      <View style={styles.tableArea}>
        <View style={styles.tableInnerRing} pointerEvents="none" />
        {gameState.phase === "dealing" ? (
          <View style={styles.tableCenter}>
            <View style={styles.dealingVisual}>
              <Text style={styles.dealingCardStack}>🃏</Text>
              <Text style={styles.dealingTitle}>{dealerPlayer?.username ?? "Dealer"} dealt the cards</Text>
              <Text style={styles.dealingSubtitle}>Review your hand — bidding starts next</Text>
            </View>
          </View>
        ) : gameState.phase === "playing" || gameState.phase === "bidding" ? (
          <View style={styles.tableCenter}>
            <Text style={styles.trickLabel}>
              {gameState.phase === "playing" ? "TABLE" : "BIDDING ROUND"}
            </Text>
            <View style={styles.trickCards}>
              {gameState.current_trick.length === 0 ? (
                <Text style={styles.noTrickText}>
                  {gameState.phase === "playing" ? "Waiting for first card…" : "Place your bids"}
                </Text>
              ) : (
                gameState.current_trick.map((tc, i) => (
                  <View key={i} style={[styles.trickCard, { transform: [{ rotate: `${(i - 1) * 3}deg` }] }]}>
                    <View style={styles.trickCardInitialBadge}>
                      <Text style={styles.trickCardInitial}>{tc.username.charAt(0)}</Text>
                    </View>
                    <Text style={styles.trickCardValue}>{tc.card}</Text>
                    <Text style={styles.trickCardPlayer}>{tc.username}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        ) : null}
      </View>

      {/* Hand panel */}
      {showHandPanel && (
        <View style={[styles.handPanel, isMyTurn && gameState.phase === "playing" && styles.handPanelGlow, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 12) }]}>
          <View style={styles.handHeader}>
            <Text style={styles.handTitle}>Your Hand · {myHand.length} cards</Text>
            {gameState.phase !== "dealing" && (
              <View style={styles.collectedPill}>
                <Text style={styles.collectedText}>
                  Bid: {gameState.bids[myUserId] !== null ? gameState.bids[myUserId] : "—"} · Won: {myCollected}
                </Text>
              </View>
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

      <Modal
        transparent
        visible={quitModalVisible}
        animationType="fade"
        onRequestClose={() => {
          setQuitModalVisible(false);
          setQuitAction(null);
        }}
      >
        <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderIcon}>
                <Ionicons name="warning" size={32} color={colors.light.destructive} />
              </View>

              <Text style={styles.modalTitle}>Quit Game?</Text>
              <Text style={styles.modalDescription}>
                Are you sure you want to quit? Leaving now will remove you from this game session and interrupt the match.
              </Text>

              <View style={styles.modalButtonRow}>
                <Pressable
                  onPress={() => {
                    setQuitModalVisible(false);
                    setQuitAction(null);
                  }}
                  style={({ pressed }) => [
                    styles.modalCancelBtn,
                    pressed && styles.modalBtnPressed
                  ]}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={confirmQuit}
                  style={({ pressed }) => [
                    styles.modalConfirmBtn,
                    pressed && styles.modalBtnPressed
                  ]}
                >
                  <Text style={styles.modalConfirmText}>Quit</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </BlurView>
      </Modal>

      {emojiBursts.map((e) => (
        <FloatingEmoji key={e.id} char={e.char} startX={e.startX} delay={e.delay} />
      ))}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular" },

  // Top Bar
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.light.border },
  topBarLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  exitBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.light.cardElevated, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.light.border },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  muteButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.light.cardElevated, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.light.border },
  roundLabel: { fontSize: 14, fontWeight: "700", color: colors.light.gold, fontFamily: "Inter_700Bold" },
  phaseBadge: { backgroundColor: colors.light.goldGlow, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.light.goldDim },
  phaseBadgePlaying: { backgroundColor: colors.light.emeraldGlow, borderColor: colors.light.accent },
  phaseBadgeDealing: { backgroundColor: colors.light.purpleGlow, borderColor: `${colors.light.purple}40` },
  phaseLabel: { fontSize: 10, fontWeight: "600", color: colors.light.foreground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  scorePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.light.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: colors.light.border },
  scoreValue: { fontSize: 15, fontWeight: "700", color: colors.light.gold, fontFamily: "Inter_700Bold" },

  // Opponent Bar
  opponentBar: { maxHeight: 84, borderBottomWidth: 1, borderBottomColor: colors.light.border, backgroundColor: colors.light.card },
  opponentBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: "center" },
  opponentChip: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.light.background, borderWidth: 1, borderColor: colors.light.border, gap: 10, minWidth: 140 },
  opponentChipActive: { borderColor: colors.light.gold, backgroundColor: colors.light.goldGlow },
  opponentChipMe: { borderColor: colors.light.accent, backgroundColor: colors.light.emeraldGlow },
  opponentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.light.muted, alignItems: "center", justifyContent: "center", position: "relative" },
  opponentAvatarActive: { backgroundColor: colors.light.gold },
  opponentAvatarText: { fontSize: 14, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  dealerDot: { position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.light.gold, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.light.card },
  dealerDotText: { fontSize: 8, fontWeight: "700", color: colors.light.background },
  opponentInfo: { gap: 1 },
  opponentName: { fontSize: 12, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  opponentSubRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  opponentScore: { fontSize: 10, fontWeight: "600", color: colors.light.gold, fontFamily: "Inter_600SemiBold" },
  opponentBidStatus: { fontSize: 10, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular" },

  // Central Table
  tableArea: { flex: 1, backgroundColor: colors.light.tableGreen, margin: 10, borderRadius: 24, borderWidth: 2, borderColor: "#1A4030", justifyContent: "center", alignItems: "center", overflow: "hidden", position: "relative" },
  tableInnerRing: { position: "absolute", top: 12, left: 12, right: 12, bottom: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(212, 175, 55, 0.2)", borderStyle: "dashed" },
  tableCenter: { alignItems: "center", justifyContent: "center", padding: 20, gap: 14 },
  dealingVisual: { alignItems: "center", gap: 10 },
  dealingCardStack: { fontSize: 56 },
  dealingTitle: { fontSize: 16, fontWeight: "700", color: "#C8E6D8", fontFamily: "Inter_700Bold", textAlign: "center" },
  dealingSubtitle: { fontSize: 13, color: "#6EAB8B", fontFamily: "Inter_400Regular", textAlign: "center" },
  trickLabel: { fontSize: 11, fontWeight: "700", color: "#6EAB8B", fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 2 },
  trickCards: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", alignItems: "center", minHeight: 110 },
  trickCard: { backgroundColor: "#FFFFFF", borderRadius: 12, width: 76, height: 106, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6, borderWidth: 1, borderColor: "#E8E8E8" },
  trickCardInitialBadge: { position: "absolute", top: 6, left: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.light.goldGlow, alignItems: "center", justifyContent: "center" },
  trickCardInitial: { fontSize: 10, fontWeight: "700", color: colors.light.gold, fontFamily: "Inter_700Bold" },
  trickCardValue: { fontSize: 26, fontWeight: "700", color: "#1A1A2E", fontFamily: "Inter_700Bold" },
  trickCardPlayer: { fontSize: 9, color: "#888", marginTop: 4, fontFamily: "Inter_400Regular" },
  noTrickText: { fontSize: 14, color: "#6EAB8B", fontStyle: "italic" },

  // Hand Panel
  handPanel: { backgroundColor: colors.light.card, borderTopWidth: 1, borderTopColor: colors.light.border, padding: 14, gap: 8 },
  handPanelGlow: { borderTopColor: colors.light.gold, borderTopWidth: 2, backgroundColor: colors.light.goldGlow },
  handHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  handTitle: { fontSize: 13, fontWeight: "600", color: colors.light.foreground, fontFamily: "Inter_600SemiBold" },
  collectedPill: { backgroundColor: colors.light.emeraldGlow, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: `${colors.light.win}30` },
  collectedText: { fontSize: 11, color: colors.light.win, fontFamily: "Inter_600SemiBold" },
  handCards: { gap: 0, paddingHorizontal: 8, paddingBottom: 4, alignItems: "center" },
  handCard: { backgroundColor: "#FAFAF8", borderRadius: 10, width: 68, height: 96, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#D0D0D0", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3, position: "relative" },
  handCardPlayable: { borderColor: colors.light.gold, shadowColor: colors.light.gold, shadowOpacity: 0.3 },
  handCardDisabled: { opacity: 0.75 },
  handCardPressed: { transform: [{ translateY: -10 }], borderColor: colors.light.accent, borderWidth: 2 },
  handCardCornerSuit: { position: "absolute", top: 6, left: 8, fontSize: 11, fontWeight: "700" },
  handCardBottomSuit: { position: "absolute", bottom: 6, right: 8, fontSize: 11, fontWeight: "700", transform: [{ rotate: "180deg" }] },
  handCardValue: { fontSize: 22, fontWeight: "700", color: "#1A1A2E", fontFamily: "Inter_700Bold" },
  noCardsText: { fontSize: 13, color: colors.light.mutedForeground, fontStyle: "italic", alignSelf: "center" },

  // Action Panels
  actionPanel: { backgroundColor: colors.light.card, borderTopWidth: 1, borderTopColor: colors.light.border, padding: 16, gap: 8 },
  actionTitle: { fontSize: 16, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  bidRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  bidInput: { flex: 1, backgroundColor: colors.light.input, borderWidth: 1, borderColor: colors.light.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 24, color: colors.light.foreground, fontFamily: "Inter_700Bold", textAlign: "center" },
  bidBtn: { backgroundColor: colors.light.gold, borderRadius: 14, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  bidBtnDisabled: { opacity: 0.35 },
  bidBtnText: { fontSize: 15, fontWeight: "700", color: colors.light.background, fontFamily: "Inter_700Bold" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.light.gold, borderRadius: 14, paddingVertical: 16 },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: colors.light.background, fontFamily: "Inter_700Bold" },
  waitingText: { fontSize: 14, color: colors.light.mutedForeground, textAlign: "center", paddingVertical: 8 },
  yourTurnText: { fontSize: 14, fontWeight: "700", color: colors.light.gold, textAlign: "center", fontFamily: "Inter_700Bold" },

  // Scoring Overlay
  scoringOverlay: { backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", paddingHorizontal: 20, zIndex: 100 },
  scoringSheet: { backgroundColor: colors.light.card, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: colors.light.border },
  scoringTitle: { fontSize: 20, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 20 },
  scoringTable: { gap: 8 },
  scoringHeaderRow: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.light.border },
  scoringHeaderCell: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.light.mutedForeground, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  scoringRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.light.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.light.border },
  scoringCell: { flex: 1, fontSize: 14, color: colors.light.foreground, fontFamily: "Inter_400Regular", textAlign: "center" },

  // Quit Modal
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)", padding: 24 },
  modalCard: { backgroundColor: colors.light.card, borderRadius: 24, padding: 28, width: "100%", maxWidth: 320, alignItems: "center", borderWidth: 1, borderColor: colors.light.border, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  modalHeaderIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: `${colors.light.destructive}15`, justifyContent: "center", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold", marginBottom: 8, textAlign: "center" },
  modalDescription: { fontSize: 14, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center", marginBottom: 24 },
  modalButtonRow: { flexDirection: "row", gap: 12, width: "100%" },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.light.input, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.light.border },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: colors.light.foreground, fontFamily: "Inter_600SemiBold" },
  modalConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.light.destructive, alignItems: "center", justifyContent: "center" },
  modalConfirmText: { fontSize: 15, fontWeight: "600", color: "#FFFFFF", fontFamily: "Inter_600SemiBold" },
  modalBtnPressed: { opacity: 0.85 },
});

