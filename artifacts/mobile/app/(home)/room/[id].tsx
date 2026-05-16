import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUser } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import { useAuthContext } from "@/context/AuthContext";
import {
  generateDeck,
  dealCards,
  getDealerForRound,
  getFirstPlayerSeat,
} from "@/lib/gameLogic";
import type { Room, RoomPlayer } from "@/types/game";

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { getClient } = useAuthContext();
  const insets = useSafeAreaInsets();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const fetchRoom = useCallback(async () => {
    if (!id) return;
    try {
      const client = getClient();
      const [roomRes, playersRes] = await Promise.all([
        client.from("rooms").select("*").eq("id", id).single(),
        client
          .from("room_players")
          .select("*")
          .eq("room_id", id)
          .order("seat_order"),
      ]);

      if (roomRes.data) setRoom(roomRes.data as Room);
      if (playersRes.data) setPlayers(playersRes.data as RoomPlayer[]);

      if (roomRes.data?.status === "playing") {
        const { data: gs } = await client
          .from("game_states")
          .select("id")
          .eq("room_id", id)
          .single();
        if (gs) router.replace(`/(home)/game/${id}`);
      }
    } catch (e) {
      console.error("fetchRoom error:", e);
    } finally {
      setLoading(false);
    }
  }, [id, getClient]);

  useEffect(() => {
    fetchRoom();

    const client = getClient();
    const channel = client
      .channel(`room-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${id}` }, (payload) => {
        const updated = payload.new as Room;
        setRoom(updated);
        if (updated.status === "playing") {
          router.replace(`/(home)/game/${id}`);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${id}` }, () => {
        fetchRoom();
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [id, fetchRoom]);

  const isCreator = room?.creator_id === user?.id;
  const canStart = players.length >= 3 && players.length <= 10;

  const startGame = async () => {
    if (!room || !canStart || !user) return;
    setStarting(true);
    try {
      const client = getClient();
      const totalCards = players.length * room.cards_per_player;
      const deck = generateDeck(totalCards);
      const dealerSeat = getDealerForRound(1, players.length);
      const firstTurnSeat = getFirstPlayerSeat(dealerSeat, players.length);
      const hands = dealCards(deck, players, room.cards_per_player);

      const initialBids: Record<string, null> = {};
      const initialTricks: Record<string, number> = {};
      const initialScores: Record<string, number> = {};
      players.forEach((p) => {
        initialBids[p.clerk_user_id] = null;
        initialTricks[p.clerk_user_id] = 0;
        initialScores[p.clerk_user_id] = 0;
      });

      await client.from("game_states").insert({
        room_id: room.id,
        current_round: 1,
        dealer_seat: dealerSeat,
        current_turn_seat: firstTurnSeat,
        phase: "bidding",
        hands,
        bids: initialBids,
        bids_revealed: false,
        tricks_collected: initialTricks,
        current_trick: [],
        scores: initialScores,
      });

      await client.from("rooms").update({ status: "playing", current_round: 1 }).eq("id", room.id);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {
      console.error("startGame error:", e);
      Alert.alert("Error", "Failed to start game.");
    } finally {
      setStarting(false);
    }
  };

  const leaveRoom = async () => {
    if (!user || !id) return;
    try {
      const client = getClient();
      await client.from("room_players").delete().eq("room_id", id).eq("clerk_user_id", user.id);
      router.replace("/(home)/lobby");
    } catch (e) {
      console.error("leaveRoom error:", e);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.light.gold} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0), paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) }]}>
      <View style={styles.header}>
        <Pressable onPress={leaveRoom} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.light.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.roomName}>{room?.name}</Text>
          <Text style={styles.roomMeta}>
            {room?.cards_per_player} cards · {room?.total_rounds} rounds
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.statusBadge}>
        <View style={styles.dot} />
        <Text style={styles.statusText}>
          Waiting for players ({players.length}/10)
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Players</Text>
      <FlatList
        data={players}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.playerList}
        renderItem={({ item, index }) => (
          <View style={styles.playerRow}>
            <View style={styles.seatBadge}>
              <Text style={styles.seatText}>{index + 1}</Text>
            </View>
            <Text style={styles.playerName}>{item.username}</Text>
            {item.clerk_user_id === room?.creator_id && (
              <View style={styles.hostBadge}>
                <Ionicons name="star" size={12} color={colors.light.gold} />
                <Text style={styles.hostText}>Host</Text>
              </View>
            )}
            {item.clerk_user_id === user?.id && (
              <Text style={styles.youLabel}>You</Text>
            )}
          </View>
        )}
        ListFooterComponent={
          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.light.mutedForeground} />
            <Text style={styles.hintText}>
              {canStart
                ? "Ready to start!"
                : `Need ${Math.max(0, 3 - players.length)} more player${Math.max(0, 3 - players.length) !== 1 ? "s" : ""} to start`}
            </Text>
          </View>
        }
      />

      {isCreator && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable
            onPress={startGame}
            disabled={!canStart || starting}
            style={({ pressed }) => [
              styles.startBtn,
              (!canStart || starting) && styles.startBtnDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            {starting ? (
              <ActivityIndicator color={colors.light.background} />
            ) : (
              <>
                <Ionicons name="play" size={20} color={colors.light.background} />
                <Text style={styles.startBtnText}>Start Game</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {!isCreator && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.waitingText}>Waiting for host to start the game...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.light.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  roomName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  roomMeta: {
    fontSize: 12,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: colors.light.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.light.win,
  },
  statusText: {
    fontSize: 13,
    color: colors.light.foreground,
    fontFamily: "Inter_400Regular",
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.light.mutedForeground,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 20,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  playerList: { paddingHorizontal: 20, gap: 8, paddingBottom: 20 },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.light.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
  },
  seatBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.light.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  seatText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.light.gold,
    fontFamily: "Inter_700Bold",
  },
  playerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: colors.light.foreground,
    fontFamily: "Inter_500Medium",
  },
  hostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.light.muted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  hostText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.light.gold,
    fontFamily: "Inter_600SemiBold",
  },
  youLabel: {
    fontSize: 11,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  hintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.light.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.light.border,
    marginTop: 8,
  },
  hintText: {
    fontSize: 13,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.light.gold,
    borderRadius: 14,
    paddingVertical: 16,
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.light.background,
    fontFamily: "Inter_700Bold",
  },
  waitingText: {
    fontSize: 14,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 16,
  },
});
