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
import { useKeepAwake } from "expo-keep-awake";
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
  const suitColors = ["#111827", "#EF4444", "#111827", "#EF4444"];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.handCards}>
      {hand.map((card, i) => {
        const suitIdx = card % 4;
        return (
          <Pressable
            key={`${card}-${i}`}
            onPress={() => playable && onPlayCard?.(card)}
            disabled={!playable || playingCard}
            style={({ pressed }) => [
              styles.handCard,
              i > 0 && { marginLeft: -12 },
              !playable && styles.handCardDisabled,
              pressed && playable && styles.handCardPressed,
              playable && styles.handCardPlayable,
            ]}
          >
            <LinearGradient
              colors={["#FFFFFF", "#F3EFE0"]}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Top-Left Corner Index */}
            <View style={styles.cardCornerTop}>
              <Text style={[styles.cornerValue, { color: suitColors[suitIdx] }]}>{card}</Text>
              <Text style={[styles.cornerSuit, { color: suitColors[suitIdx] }]}>{suits[suitIdx]}</Text>
            </View>

            {/* Center Watermark */}
            <View style={styles.centerWatermarkContainer}>
              <Text style={[styles.centerWatermark, { color: suitColors[suitIdx] }]}>
                {suits[suitIdx]}
              </Text>
            </View>

            {/* Main Center Value */}
            <Text style={[styles.cardValue, { color: "#111827" }]}>{card}</Text>

            {/* Bottom-Right Corner Index (inverted) */}
            <View style={styles.cardCornerBottom}>
              <Text style={[styles.cornerValue, { color: suitColors[suitIdx] }]}>{card}</Text>
              <Text style={[styles.cornerSuit, { color: suitColors[suitIdx] }]}>{suits[suitIdx]}</Text>
            </View>

            {/* Disabled Overlay */}
            {!playable && (
              <View
                style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(255, 255, 255, 0.45)" }]}
                pointerEvents="none"
              />
            )}
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
  useKeepAwake();
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
  const [scoreModalVisible, setScoreModalVisible] = useState(false);
  const [completedWinnerId, setCompletedWinnerId] = useState<string | null>(null);
  const [isTrickTransitioning, setIsTrickTransitioning] = useState(false);
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

  const trickScale = useRef(new Animated.Value(1)).current;
  const trickOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (completedWinnerId) {
      trickScale.setValue(1);
      trickOpacity.setValue(1);

      Animated.sequence([
        Animated.spring(trickScale, {
          toValue: 1.6,
          useNativeDriver: true,
          tension: 45,
          friction: 4,
        }),
        Animated.delay(900),
        Animated.timing(trickOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      trickScale.setValue(1);
      trickOpacity.setValue(1);
    }
  }, [completedWinnerId, trickScale, trickOpacity]);

  const myUserId = user?.id ?? "";

  const updateGameStateWithTrickDelay = useCallback((nextState: GameState) => {
    setGameState((prevState) => {
      if (!prevState) {
        if (nextState.phase === "finished") {
          router.replace(`/(home)/leaderboard/${id}`);
        }
        return nextState;
      }

      const prevTrick = prevState.current_trick || [];
      const nextTrick = nextState.current_trick || [];

      // A trick just completed if the previous state had (players.length - 1) or players.length cards, and the new state trick is empty
      const prevTrickCompleted = prevTrick.length > 0 &&
        (prevTrick.length === players.length - 1 || prevTrick.length === players.length) &&
        nextTrick.length === 0;

      if (prevTrickCompleted) {
        setIsTrickTransitioning(true);

        let fullCompletedTrick = prevTrick;
        let winnerId = "";

        if (prevTrick.length === players.length) {
          const winner = prevTrick.reduce((highest, item) => (item.card > highest.card ? item : highest));
          winnerId = winner.clerk_user_id;
        } else {
          // Find which player played the completing card (the current turn seat in prevState)
          const lastPlayerSeat = prevState.current_turn_seat;
          const lastPlayer = players.find((p) => p.seat_order === lastPlayerSeat);

          let playedCard = 0;
          if (lastPlayer) {
            const prevHand = prevState.hands[lastPlayer.clerk_user_id] || [];
            const nextHand = nextState.hands[lastPlayer.clerk_user_id] || [];
            playedCard = prevHand.find((c) => !nextHand.includes(c)) || 0;
          }

          if (lastPlayer && playedCard > 0) {
            const lastPlayedCardObj = {
              clerk_user_id: lastPlayer.clerk_user_id,
              username: lastPlayer.username,
              seat_order: lastPlayer.seat_order,
              card: playedCard,
            };

            fullCompletedTrick = [...prevTrick, lastPlayedCardObj];
            const winner = fullCompletedTrick.reduce((highest, item) => (item.card > highest.card ? item : highest));
            winnerId = winner.clerk_user_id;
          }
        }

        if (winnerId) {
          setCompletedWinnerId(winnerId);

          setTimeout(() => {
            setCompletedWinnerId(null);
            setIsTrickTransitioning(false);
            setGameState(nextState);
            if (nextState.phase === "finished") {
              router.replace(`/(home)/leaderboard/${id}`);
            }
          }, 2500);

          // Return the incoming state but override current_trick with fullCompletedTrick so it remains rendered
          return {
            ...nextState,
            current_trick: fullCompletedTrick,
          };
        }
      }

      if (nextState.phase === "finished") {
        router.replace(`/(home)/leaderboard/${id}`);
      }

      return nextState;
    });
  }, [players, id, router]);

  const handleSetGameState = useCallback((nextState: GameState) => {
    updateGameStateWithTrickDelay(nextState);
  }, [updateGameStateWithTrickDelay]);

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
        handleSetGameState(gameData.game_state);
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
      handleSetGameState(gs);
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
      handleSetGameState(data.game_state);
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
      handleSetGameState(data.game_state);
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
      handleSetGameState(data.game_state);
      setBidInput("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? e.message : "Failed to submit bid");
    } finally {
      setSubmittingBid(false);
    }
  };

  const playCard = async (card: number) => {
    if (!id || playingCard || isTrickTransitioning || !gameState) return;
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Save previous state for reverting in case of failure
    const prevState = gameState;

    const currentUserId = user?.id ?? "";
    const currentPlayer = players.find((p) => p.clerk_user_id === currentUserId);

    // Construct optimistic hand and trick state
    const nextHand = (gameState.hands[currentUserId] ?? []).filter((c) => c !== card);
    const newTrickObj = {
      clerk_user_id: currentUserId,
      username: currentPlayer?.username ?? "You",
      seat_order: currentPlayer?.seat_order ?? 0,
      card,
    };
    const nextTrick = [...(gameState.current_trick || []), newTrickObj];

    // Optimistically update local state
    setGameState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        hands: {
          ...prev.hands,
          [currentUserId]: nextHand,
        },
        current_trick: nextTrick,
        current_turn_seat: -1, // Clear turn indicator locally
      };
    });

    setPlayingCard(true);
    try {
      const data = await apiFetch<{ game_state: GameState }>(`/game/${id}/play`, {
        method: "POST",
        body: JSON.stringify({ card }),
      });
      handleSetGameState(data.game_state);
      
    } catch (e) {
      // Revert to previous state on failure
      setGameState(prevState);
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

  const getStatusText = () => {
    if (gameState.phase === "dealing") {
      return `${dealerPlayer?.username ?? "Dealer"} is dealing the cards...`;
    }
    if (gameState.phase === "bidding") {
      if (isMyTurn && !hasBid) {
        return "Your turn! Place your bid below.";
      }
      return `Waiting for ${currentTurnPlayer?.username ?? "next player"} to place their bid...`;
    }
    if (gameState.phase === "playing") {
      const lastPlay = gameState.current_trick[gameState.current_trick.length - 1];
      if (lastPlay) {
        const turnText = isMyTurn
          ? "Your turn! Play a card."
          : `Waiting for ${currentTurnPlayer?.username ?? "next player"}...`;
        return `${lastPlay.username} threw Card ${lastPlay.card}. ${turnText}`;
      } else {
        if (isMyTurn) {
          return "New trick started! You lead — play a card.";
        }
        return `New trick started! Waiting for ${currentTurnPlayer?.username ?? "next player"} to lead...`;
      }
    }
    if (gameState.phase === "scoring") {
      return `Round ${gameState.current_round} ended. Reviewing scores...`;
    }
    return "";
  };

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
          <Pressable
            onPress={() => setScoreModalVisible(true)}
            style={({ pressed }) => [
              styles.scoresBtn,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons name="trophy-outline" size={16} color={colors.light.gold} />
            <Text style={styles.scoresBtnText}>Scores</Text>
          </Pressable>
        </View>
      </View>

      {/* Game Actions & Status Banner */}
      <View style={styles.statusBar}>
        <Ionicons name="information-circle-outline" size={18} color={colors.light.gold} />
        <Text style={styles.statusBarText} numberOfLines={2}>
          {getStatusText()}
        </Text>
      </View>

      {/* Central felt table area */}
      <View style={styles.tableArea}>
        <View style={styles.tableContainer}>
          <View style={styles.roundTable} />
          
          {/* Central phase status text inside the round table */}
          {completedWinnerId ? (
            <View style={styles.tableCenterDealing}>
              <Text style={{ fontSize: 26, marginBottom: 2 }}>🏆</Text>
              <Text style={[styles.tableCenterText, { color: colors.light.gold }]}>
                {completedWinnerId === myUserId ? "You Win!" : `${players.find(pl => pl.clerk_user_id === completedWinnerId)?.username ?? "Winner"} wins!`}
              </Text>
            </View>
          ) : gameState.phase === "dealing" ? (
            <View style={styles.tableCenterDealing}>
              <Text style={styles.tableCenterEmoji}>🃏</Text>
              <Text style={styles.tableCenterText}>Dealing</Text>
            </View>
          ) : gameState.phase === "bidding" ? (
            <View style={styles.tableCenterDealing}>
              <Text style={styles.tableCenterEmoji}>🤔</Text>
              <Text style={styles.tableCenterText}>Bidding</Text>
            </View>
          ) : gameState.phase === "playing" && gameState.current_trick.length === 0 ? (
            <View style={styles.tableCenterDealing}>
              <Text style={styles.tableCenterEmoji}>🃏</Text>
              <Text style={styles.tableCenterText}>Play Card</Text>
            </View>
          ) : null}

          {/* Render players dynamically positioned around the round table */}
          {players.map((p) => {
            const total = players.length;
            const myPlayerSeat = myPlayer?.seat_order ?? 0;
            
            // Calculate relative index starting from me (index 0)
            const relativeIndex = (p.seat_order - myPlayerSeat + total) % total;
            
            // angleDeg: 90 is bottom (South). Stepping clockwise (90 + relIndex * 360 / total)
            const angleDeg = 90 + (relativeIndex * 360) / total;
            const angleRad = (angleDeg * Math.PI) / 180;
            
            // Center of table is (170, 170)
            // Player slot positioned at radius 120
            const left = 170 + 120 * Math.cos(angleRad) - 40; // width=80 -> offset 40
            const top = 170 + 120 * Math.sin(angleRad) - 37.5; // height=75 -> offset 37.5
            
            // Played card positioned at radius 55
            const cardLeft = 170 + 55 * Math.cos(angleRad) - 21; // width=42 -> offset 21
            const cardTop = 170 + 55 * Math.sin(angleRad) - 29; // height=58 -> offset 29

            const isActive = p.seat_order === gameState.current_turn_seat && gameState.phase !== "dealing";
            const isMe = p.clerk_user_id === myUserId;
            const isPlayerDealer = p.seat_order === gameState.dealer_seat;
            const playerBid = gameState.bids[p.clerk_user_id];
            const playerCollected = gameState.tricks_collected[p.clerk_user_id] ?? 0;
            
            // Check if this player has played a card in the current trick
            const playedCardObj = gameState.current_trick.find((tc) => tc.clerk_user_id === p.clerk_user_id);

            return (
              <React.Fragment key={p.id}>
                {/* Played Card */}
                {gameState.phase === "playing" && playedCardObj && (() => {
                  const suits = ["♠", "♥", "♣", "♦"];
                  const suitColors = ["#111827", "#EF4444", "#111827", "#EF4444"];
                  const suitIdx = playedCardObj.card % 4;
                  return (
                    <Animated.View 
                      style={[
                        styles.tablePlayedCard, 
                        { 
                          left: cardLeft, 
                          top: cardTop,
                          transform: [
                            { scale: completedWinnerId === p.clerk_user_id ? trickScale : 1 }
                          ],
                          opacity: completedWinnerId ? trickOpacity : 1
                        },
                        completedWinnerId === p.clerk_user_id && styles.tablePlayedCardWinning
                      ]}
                    >
                      <LinearGradient
                        colors={["#FFFFFF", "#F3EFE0"]}
                        style={StyleSheet.absoluteFillObject}
                      />

                      {/* Small suit watermark in center */}
                      <View style={styles.tableCardCenterWatermarkContainer}>
                        <Text style={[styles.tableCardCenterWatermark, { color: suitColors[suitIdx] }]}>
                          {suits[suitIdx]}
                        </Text>
                      </View>

                      <Text style={[styles.tablePlayedCardValue, { color: "#111827" }]}>
                        {playedCardObj.card}
                      </Text>

                      {completedWinnerId === p.clerk_user_id && (
                        <View style={styles.winningCardCrown}>
                          <Ionicons name="trophy" size={10} color="#FFFFFF" />
                        </View>
                      )}
                    </Animated.View>
                  );
                })()}

                {/* Player Slot Info */}
                <View
                  style={[
                    styles.playerSlot,
                    isMe && styles.playerSlotMe,
                    isActive && styles.playerSlotActive,
                    { left, top }
                  ]}
                >
                  <View style={styles.playerSlotAvatarContainer}>
                    {p.avatar_url ? (
                      <Image source={{ uri: p.avatar_url }} style={styles.playerSlotAvatar} />
                    ) : (
                      <View style={[styles.playerSlotAvatar, styles.playerSlotAvatarPlaceholder]}>
                        <Text style={styles.avatarPlaceholderText}>
                          {p.username.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    {isPlayerDealer && (
                      <View style={styles.slotDealerDot}>
                        <Text style={styles.slotDealerDotText}>D</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.playerSlotInfo}>
                    <Text style={styles.playerSlotName} numberOfLines={1}>
                      {isMe ? "You" : p.username}
                    </Text>
                    {gameState.phase !== "dealing" && (
                      <Text style={styles.playerSlotPoints}>
                        {gameState.phase === "bidding" && !gameState.bids_revealed
                          ? (playerBid !== null ? "✓" : "…")
                          : `B:${playerBid ?? "—"} W:${playerCollected}`}
                      </Text>
                    )}
                  </View>
                </View>
              </React.Fragment>
            );
          })}
        </View>
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
          <HandCards hand={myHand} onPlayCard={playCard} playable={gameState.phase === "playing" && isMyTurn && !isTrickTransitioning} playingCard={playingCard} />
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
        visible={scoreModalVisible}
        animationType="fade"
        onRequestClose={() => setScoreModalVisible(false)}
      >
        <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark">
          <View style={styles.modalOverlay}>
            <View style={styles.scoreModalCard}>
              <View style={styles.scoreModalHeader}>
                <Ionicons name="trophy" size={28} color={colors.light.gold} />
                <Text style={styles.scoreModalTitle}>Total Scores</Text>
              </View>

              <View style={styles.scoreModalTable}>
                <View style={styles.scoreModalHeaderRow}>
                  <Text style={[styles.scoreModalHeaderCell, { flex: 2, textAlign: "left" }]}>Player</Text>
                  <Text style={styles.scoreModalHeaderCell}>Seat</Text>
                  <Text style={[styles.scoreModalHeaderCell, { textAlign: "right" }]}>Score</Text>
                </View>
                {[...players]
                  .sort((a, b) => {
                    const scoreA = gameState.scores[a.clerk_user_id] ?? 0;
                    const scoreB = gameState.scores[b.clerk_user_id] ?? 0;
                    return scoreB - scoreA;
                  })
                  .map((p) => {
                    const score = gameState.scores[p.clerk_user_id] ?? 0;
                    const isMe = p.clerk_user_id === myUserId;
                    return (
                      <View key={p.id} style={[styles.scoreModalRow, isMe && styles.scoreModalRowMe]}>
                        <View style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {p.avatar_url ? (
                            <Image source={{ uri: p.avatar_url }} style={styles.scoreModalAvatar} />
                          ) : (
                            <View style={styles.scoreModalAvatarPlaceholder}>
                              <Text style={styles.scoreModalAvatarText}>{p.username.charAt(0).toUpperCase()}</Text>
                            </View>
                          )}
                          <Text style={[styles.scoreModalCellText, { textAlign: "left" }, isMe && { fontWeight: "700", color: colors.light.gold }]} numberOfLines={1}>
                            {isMe ? "You" : p.username}
                          </Text>
                        </View>
                        <Text style={styles.scoreModalCellText}>{p.seat_order}</Text>
                        <Text style={[styles.scoreModalCellText, { fontWeight: "700", color: colors.light.gold, textAlign: "right" }]}>{score} pts</Text>
                      </View>
                    );
                  })}
              </View>

              <Pressable
                onPress={() => setScoreModalVisible(false)}
                style={({ pressed }) => [
                  styles.scoreModalCloseBtn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.scoreModalCloseText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </BlurView>
      </Modal>

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
  scoresBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(212, 175, 55, 0.12)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.3)",
  },
  scoresBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.light.gold,
    fontFamily: "Inter_700Bold",
  },

  // Game Status Banner
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.9)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
    gap: 10,
  },
  statusBarText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
  },

  // Central Table REDESIGN
  tableArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  tableContainer: {
    width: 340,
    height: 340,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  roundTable: {
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: colors.light.tableGreen || "#1A4030",
    borderWidth: 6,
    borderColor: "#102F22",
    position: "absolute",
    top: 65,
    left: 65,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  tableCenterDealing: {
    position: "absolute",
    top: 110,
    left: 110,
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  tableCenterEmoji: {
    fontSize: 24,
  },
  tableCenterText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6EAB8B",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    textAlign: "center",
    marginTop: 2,
  },
  tablePlayedCard: {
    position: "absolute",
    width: 44,
    height: 60,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  tableCardCenterWatermarkContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.08,
  },
  tableCardCenterWatermark: {
    fontSize: 30,
  },
  tablePlayedCardValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    fontFamily: "Inter_800ExtraBold",
  },
  tablePlayedCardWinning: {
    borderColor: colors.light.gold,
    borderWidth: 2.5,
    shadowColor: colors.light.gold,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  winningCardCrown: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.light.gold,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },

  // Player Slot Info
  playerSlot: {
    position: "absolute",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: 80,
    height: 75,
    backgroundColor: "rgba(30, 41, 59, 0.85)",
    borderRadius: 12,
    borderWidth: 0,
    borderColor: "transparent",
    padding: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  playerSlotActive: {
    borderColor: colors.light.gold,
    backgroundColor: "rgba(212, 175, 55, 0.15)",
    borderWidth: 2,
  },
  playerSlotMe: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  playerSlotAvatarContainer: {
    position: "relative",
    width: 32,
    height: 32,
    marginBottom: 4,
  },
  playerSlotAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  playerSlotAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.light.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPlaceholderText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.light.foreground,
  },
  slotDealerDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.light.gold,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.light.card,
  },
  slotDealerDotText: {
    fontSize: 7,
    fontWeight: "700",
    color: colors.light.background,
  },
  playerSlotInfo: {
    alignItems: "center",
    width: "100%",
  },
  playerSlotName: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  playerSlotPoints: {
    fontSize: 8,
    fontWeight: "600",
    color: colors.light.gold,
    textAlign: "center",
    marginTop: 1,
  },

  // Scores Modal Styles
  scoreModalCard: {
    backgroundColor: colors.light.card,
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: colors.light.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  scoreModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  scoreModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  scoreModalTable: {
    gap: 8,
    marginBottom: 20,
  },
  scoreModalHeaderRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
  },
  scoreModalHeaderCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: colors.light.mutedForeground,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  scoreModalRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.light.background,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  scoreModalRowMe: {
    borderColor: colors.light.gold,
    backgroundColor: "rgba(212, 175, 55, 0.05)",
  },
  scoreModalCellText: {
    flex: 1,
    fontSize: 13,
    color: colors.light.foreground,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  scoreModalAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  scoreModalAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.light.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreModalAvatarText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.light.foreground,
  },
  scoreModalCloseBtn: {
    backgroundColor: colors.light.gold,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreModalCloseText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.light.background,
    fontFamily: "Inter_700Bold",
  },

  // Hand Panel
  handPanel: { backgroundColor: colors.light.card, borderTopWidth: 1, borderTopColor: colors.light.border, padding: 14, gap: 8 },
  handPanelGlow: { borderTopColor: colors.light.gold, borderTopWidth: 2, backgroundColor: colors.light.goldGlow },
  handHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  handTitle: { fontSize: 13, fontWeight: "600", color: colors.light.foreground, fontFamily: "Inter_600SemiBold" },
  collectedPill: { backgroundColor: colors.light.emeraldGlow, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: `${colors.light.win}30` },
  collectedText: { fontSize: 11, color: colors.light.win, fontFamily: "Inter_600SemiBold" },
  handCards: { gap: 0, paddingHorizontal: 8, paddingBottom: 4, alignItems: "center" },
  handCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    width: 68,
    height: 98,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
    position: "relative",
    overflow: "hidden",
  },
  handCardPlayable: {
    borderColor: "#D4A84B",
    shadowColor: "#D4A84B",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  handCardDisabled: {
    borderColor: "#E2E8F0",
  },
  handCardPressed: {
    transform: [{ translateY: -12 }],
    borderColor: "#2DD4A8",
    borderWidth: 2,
  },
  cardCornerTop: {
    position: "absolute",
    top: 6,
    left: 8,
    alignItems: "center",
  },
  cardCornerBottom: {
    position: "absolute",
    bottom: 6,
    right: 8,
    alignItems: "center",
    transform: [{ rotate: "180deg" }],
  },
  cornerValue: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    lineHeight: 11,
  },
  cornerSuit: {
    fontSize: 9,
    marginTop: 1,
  },
  centerWatermarkContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.09,
  },
  centerWatermark: {
    fontSize: 44,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: "800",
    fontFamily: "Inter_800ExtraBold",
  },
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

