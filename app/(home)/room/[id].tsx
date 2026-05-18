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
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import { useAuthContext } from "@/context/AuthContext";
import { useGameSocket } from "@/hooks/useGameSocket";
import { apiFetch, ApiError } from "@/lib/api";
import { navigateToGameWhenReady } from "@/lib/navigation";
import type { Room, RoomPlayer } from "@/types/game";

function sortPlayers(list: RoomPlayer[]) {
  return [...list].sort((a, b) => a.seat_order - b.seat_order);
}

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { isSocketReady } = useAuthContext();
  const insets = useSafeAreaInsets();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const fetchRoom = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch<{
        room: Room;
        players: RoomPlayer[];
        game_state: unknown | null;
      }>(`/rooms/${id}`);

      setRoom(data.room);
      setPlayers(sortPlayers(data.players));

      if (data.room.status === "playing" && data.game_state) {
        router.replace(`/(home)/game/${id}`);
      }
    } catch (e) {
      console.error("fetchRoom error:", e);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  useGameSocket("room", id, {
    onRoomUpdate: (payload) => {
      const updated = payload as Room;
      setRoom((prev) => (prev ? { ...prev, ...updated } : updated));
      if (updated.status === "playing") {
        navigateToGameWhenReady(id!, router);
      }
    },
    onRoomPlayers: (payload) => {
      setPlayers(sortPlayers(payload as RoomPlayer[]));
    },
  });

  const isCreator = room?.creator_id === user?.id;
  const canStart = players.length >= 3 && players.length <= 10;

  const startGame = async () => {
    if (!room || !canStart || !id) return;
    setStarting(true);
    try {
      await apiFetch(`/rooms/${id}/start`, { method: "POST" });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      router.replace(`/(home)/game/${id}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to start game";
      Alert.alert("Error", msg);
    } finally {
      setStarting(false);
    }
  };

  const leaveRoom = async () => {
    if (!id) return;
    try {
      await apiFetch(`/rooms/${id}/leave`, { method: "DELETE" });
      router.replace("/(home)/lobby");
    } catch (e) {
      console.error("leaveRoom error:", e);
    }
  };

  if (loading || !isSocketReady) {
    return (
      <View style={styles.center}>
        <LinearGradient colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color={colors.light.gold} size="large" />
      </View>
    );
  }

  const needed = Math.max(0, 3 - players.length);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0), paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) }]}>
      <LinearGradient colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Pressable onPress={leaveRoom} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.light.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.roomName}>{room?.name}</Text>
          <Text style={styles.roomMeta}>{room?.cards_per_player} cards · {room?.total_rounds} rounds</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {room?.short_id && (
        <View style={styles.codeContainer}>
          <Text style={styles.codeLabel}>Room Code</Text>
          <Text style={styles.codeValue}>{room.short_id}</Text>
        </View>
      )}

      <View style={styles.statusBadge}>
        <View style={[styles.dot, canStart && styles.dotReady]} />
        <Text style={styles.statusText}>
          {canStart ? "Ready to start!" : `Waiting for players (${players.length}/10)`}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Players</Text>
      <FlatList
        data={players}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.playerList}
        renderItem={({ item }) => (
          <View style={[styles.playerRow, item.clerk_user_id === user?.id && styles.playerRowMe]}>
            <View style={[styles.seatBadge, item.clerk_user_id === room?.creator_id && styles.seatBadgeHost]}>
              <Text style={styles.seatText}>{item.seat_order}</Text>
            </View>
            <Text style={styles.playerName}>{item.username}</Text>
            {item.clerk_user_id === room?.creator_id && (
              <View style={styles.hostBadge}>
                <Ionicons name="star" size={12} color={colors.light.gold} />
                <Text style={styles.hostText}>Host</Text>
              </View>
            )}
            {item.clerk_user_id === user?.id && <Text style={styles.youLabel}>You</Text>}
          </View>
        )}
        ListFooterComponent={
          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.light.mutedForeground} />
            <Text style={styles.hintText}>
              {canStart ? "Seating order is randomized when the game starts." : `Need ${needed} more player${needed !== 1 ? "s" : ""} to start`}
            </Text>
          </View>
        }
      />

      {isCreator && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable onPress={startGame} disabled={!canStart || starting} style={[styles.startBtn, (!canStart || starting) && styles.startBtnDisabled]}>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.light.card },
  headerCenter: { flex: 1, alignItems: "center" },
  roomName: { fontSize: 20, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  roomMeta: { fontSize: 12, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular" },
  codeContainer: { alignItems: "center", marginBottom: 12 },
  codeLabel: { fontSize: 11, color: colors.light.mutedForeground, textTransform: "uppercase", letterSpacing: 1 },
  codeValue: { fontSize: 28, fontWeight: "700", color: colors.light.purple, fontFamily: "Inter_700Bold", letterSpacing: 6 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 10, marginHorizontal: 20, marginBottom: 16, backgroundColor: colors.light.card, borderRadius: 12, borderWidth: 1, borderColor: colors.light.border },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.light.mutedForeground },
  dotReady: { backgroundColor: colors.light.win },
  statusText: { fontSize: 13, color: colors.light.foreground, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: colors.light.mutedForeground, paddingHorizontal: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 },
  playerList: { paddingHorizontal: 20, gap: 8, paddingBottom: 20 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.light.card, borderRadius: 14, borderWidth: 1, borderColor: colors.light.border, padding: 14 },
  playerRowMe: { borderColor: colors.light.gold, backgroundColor: colors.light.goldGlow },
  seatBadge: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.light.muted, alignItems: "center", justifyContent: "center" },
  seatBadgeHost: { backgroundColor: colors.light.goldGlow, borderWidth: 1, borderColor: colors.light.gold },
  seatText: { fontSize: 14, fontWeight: "700", color: colors.light.gold, fontFamily: "Inter_700Bold" },
  playerName: { flex: 1, fontSize: 15, fontWeight: "500", color: colors.light.foreground, fontFamily: "Inter_500Medium" },
  hostBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.light.goldGlow, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.light.goldDim },
  hostText: { fontSize: 11, fontWeight: "600", color: colors.light.gold, fontFamily: "Inter_600SemiBold" },
  youLabel: { fontSize: 11, color: colors.light.accent, fontStyle: "italic" },
  hintBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.light.card, borderRadius: 12, borderWidth: 1, borderColor: colors.light.border, marginTop: 8 },
  hintText: { fontSize: 13, color: colors.light.mutedForeground, flex: 1 },
  footer: { paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.light.border },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.light.gold, borderRadius: 14, paddingVertical: 16 },
  startBtnDisabled: { opacity: 0.35 },
  startBtnText: { fontSize: 17, fontWeight: "700", color: colors.light.background, fontFamily: "Inter_700Bold" },
  waitingText: { fontSize: 14, color: colors.light.mutedForeground, textAlign: "center", paddingVertical: 16 },
});
