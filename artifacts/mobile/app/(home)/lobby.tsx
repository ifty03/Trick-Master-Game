import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import { useAuthContext } from "@/context/AuthContext";
import type { Room } from "@/types/game";

export default function LobbyScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { getClient } = useAuthContext();
  const insets = useSafeAreaInsets();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [cardsPerPlayer, setCardsPerPlayer] = useState(10);
  const [totalRounds, setTotalRounds] = useState(3);
  const [creating, setCreating] = useState(false);

  const fetchRooms = useCallback(async () => {
    try {
      const client = getClient();
      const { data, error } = await client
        .from("rooms")
        .select("*, room_players(count)")
        .eq("status", "waiting")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        setRooms(data as Room[]);
      }
    } catch (e) {
      console.error("fetchRooms error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getClient]);

  useEffect(() => {
    fetchRooms();

    const client = getClient();
    const channel = client
      .channel("rooms-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => {
        fetchRooms();
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [fetchRooms]);

  const createRoom = async () => {
    if (!roomName.trim() || !user) return;
    setCreating(true);
    try {
      const client = getClient();
      const { data, error } = await client
        .from("rooms")
        .insert({
          name: roomName.trim(),
          creator_id: user.id,
          status: "waiting",
          cards_per_player: cardsPerPlayer,
          total_rounds: totalRounds,
          current_round: 0,
        })
        .select()
        .single();

      if (error) throw error;

      await client.from("room_players").insert({
        room_id: data.id,
        clerk_user_id: user.id,
        username: user.username || user.firstName || user.emailAddresses[0]?.emailAddress?.split("@")[0] || "Player",
        seat_order: 1,
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowCreateModal(false);
      setRoomName("");
      router.push(`/(home)/room/${data.id}`);
    } catch (e) {
      Alert.alert("Error", "Failed to create room. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = async (room: Room) => {
    if (!user) return;
    try {
      const client = getClient();
      const { data: existingPlayers } = await client
        .from("room_players")
        .select("*")
        .eq("room_id", room.id);

      const alreadyJoined = existingPlayers?.some(p => p.clerk_user_id === user.id);
      if (!alreadyJoined) {
        const seatOrder = (existingPlayers?.length ?? 0) + 1;
        if (seatOrder > 10) {
          Alert.alert("Room Full", "This room is already full.");
          return;
        }
        await client.from("room_players").insert({
          room_id: room.id,
          clerk_user_id: user.id,
          username: user.username || user.firstName || user.emailAddresses[0]?.emailAddress?.split("@")[0] || "Player",
          seat_order: seatOrder,
        });
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/(home)/room/${room.id}`);
    } catch (e) {
      Alert.alert("Error", "Failed to join room.");
    }
  };

  const renderRoom = ({ item }: { item: Room }) => (
    <Pressable
      style={({ pressed }) => [styles.roomCard, pressed && styles.roomCardPressed]}
      onPress={() => joinRoom(item)}
    >
      <View style={styles.roomCardLeft}>
        <View style={styles.roomIconBg}>
          <Ionicons name="card" size={20} color={colors.light.gold} />
        </View>
        <View>
          <Text style={styles.roomName}>{item.name}</Text>
          <Text style={styles.roomMeta}>
            {item.cards_per_player} cards · {item.total_rounds} rounds
          </Text>
        </View>
      </View>
      <View style={styles.roomCardRight}>
        <Ionicons name="chevron-forward" size={18} color={colors.light.mutedForeground} />
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back</Text>
          <Text style={styles.username}>
            {user?.username || user?.firstName || "Player"}
          </Text>
        </View>
        <Pressable onPress={() => signOut()} style={styles.signOutBtn}>
          <Ionicons name="log-out-outline" size={24} color={colors.light.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Open Rooms</Text>
        <Pressable
          style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed]}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add" size={18} color={colors.light.background} />
          <Text style={styles.createBtnText}>Create</Text>
        </Pressable>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        renderItem={renderRoom}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchRooms(); }}
            tintColor={colors.light.gold}
          />
        }
        scrollEnabled={!!rooms.length}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.light.gold} size="large" />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="game-controller-outline" size={48} color={colors.light.muted} />
              <Text style={styles.emptyTitle}>No open rooms</Text>
              <Text style={styles.emptyText}>Create a new room to get started</Text>
            </View>
          )
        }
      />

      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>New Room</Text>

            <Text style={styles.modalLabel}>Room Name</Text>
            <TextInput
              style={styles.modalInput}
              value={roomName}
              onChangeText={setRoomName}
              placeholder="e.g. Friday Night Game"
              placeholderTextColor={colors.light.mutedForeground}
              autoFocus
            />

            <Text style={styles.modalLabel}>Cards per Player ({cardsPerPlayer})</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setCardsPerPlayer(Math.max(10, cardsPerPlayer - 1))}
                style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
              >
                <Ionicons name="remove" size={20} color={colors.light.foreground} />
              </Pressable>
              <Text style={styles.stepValue}>{cardsPerPlayer}</Text>
              <Pressable
                onPress={() => setCardsPerPlayer(Math.min(15, cardsPerPlayer + 1))}
                style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
              >
                <Ionicons name="add" size={20} color={colors.light.foreground} />
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Total Rounds</Text>
            <TextInput
              style={styles.modalInput}
              value={totalRounds.toString()}
              onChangeText={(v) => setTotalRounds(Math.max(1, parseInt(v) || 1))}
              keyboardType="number-pad"
            />

            <Text style={styles.modalHint}>
              Requires 3-10 players to start
            </Text>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setShowCreateModal(false)}
                style={({ pressed }) => [styles.modalCancelBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={createRoom}
                disabled={!roomName.trim() || creating}
                style={({ pressed }) => [
                  styles.modalCreateBtn,
                  (!roomName.trim() || creating) && styles.buttonDisabled,
                  pressed && { opacity: 0.8 },
                ]}
              >
                {creating ? (
                  <ActivityIndicator color={colors.light.background} size="small" />
                ) : (
                  <Text style={styles.modalCreateText}>Create Room</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  greeting: {
    fontSize: 13,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
  },
  username: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  signOutBtn: { padding: 8 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.light.gold,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  createBtnPressed: { opacity: 0.8 },
  createBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.light.background,
    fontFamily: "Inter_600SemiBold",
  },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  roomCard: {
    backgroundColor: colors.light.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roomCardPressed: { opacity: 0.75 },
  roomCardLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  roomIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.light.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  roomName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.light.foreground,
    fontFamily: "Inter_600SemiBold",
  },
  roomMeta: {
    fontSize: 13,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  roomCardRight: {},
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.light.foreground,
    fontFamily: "Inter_600SemiBold",
  },
  emptyText: {
    fontSize: 14,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.light.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.light.border,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.light.foreground,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: colors.light.input,
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.light.foreground,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.light.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnPressed: { opacity: 0.7 },
  stepValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
    minWidth: 30,
    textAlign: "center",
  },
  modalHint: {
    fontSize: 12,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
    marginBottom: 24,
    fontStyle: "italic",
  },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.light.muted,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.light.mutedForeground,
    fontFamily: "Inter_600SemiBold",
  },
  modalCreateBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.light.gold,
  },
  modalCreateText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.light.background,
    fontFamily: "Inter_700Bold",
  },
  buttonDisabled: { opacity: 0.5 },
});
