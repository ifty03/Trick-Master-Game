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
  ScrollView,
  KeyboardAvoidingView,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import { useAuthContext } from "@/context/AuthContext";
import { useGameSocket } from "@/hooks/useGameSocket";
import { apiFetch, ApiError } from "@/lib/api";
import type { Room } from "@/types/game";

export default function LobbyScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { isSocketReady } = useAuthContext();
  const insets = useSafeAreaInsets();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [createPassword, setCreatePassword] = useState("");
  const [cardsPerPlayer, setCardsPerPlayer] = useState(10);
  const [totalRounds, setTotalRounds] = useState(3);
  const [creating, setCreating] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [joinPassword, setJoinPassword] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const displayName =
    user?.firstName ||
    user?.username ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "Player";

  const fetchRooms = useCallback(async () => {
    try {
      const data = await apiFetch<Room[]>("/rooms?status=waiting");
      setFetchError(null);
      setRooms(data);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      console.error("fetchRooms error:", msg);
      setFetchError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useGameSocket("lobby", undefined, {
    onLobbyUpdate: fetchRooms,
  });

  const createRoom = async () => {
    if (!roomName.trim() || !user) return;
    setCreating(true);
    try {
      const data = await apiFetch<{ room: Room }>("/rooms", {
        method: "POST",
        body: JSON.stringify({
          name: roomName.trim(),
          cards_per_player: cardsPerPlayer,
          total_rounds: totalRounds,
          password: isPrivate && createPassword.trim() ? createPassword.trim() : null,
          username: displayName,
        }),
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowCreateModal(false);
      setRoomName("");
      router.push(`/(home)/room/${data.room.id}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Unknown error";
      Alert.alert("Error creating room", msg);
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = async (room: Room, password?: string) => {
    if (!user) return;
    try {
      await apiFetch(`/rooms/${room.id}/join`, {
        method: "POST",
        body: JSON.stringify({ username: displayName, password }),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/(home)/room/${room.id}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to join room";
      Alert.alert("Error", msg);
    }
  };

  const handleRoomPress = (room: Room) => {
    if (room.password) {
      setSelectedRoom(room);
      setJoinPassword("");
      setShowPasswordModal(true);
    } else {
      joinRoom(room);
    }
  };

  const submitJoinPassword = () => {
    if (selectedRoom?.password && joinPassword !== selectedRoom.password) {
      Alert.alert("Incorrect Password", "The password you entered is incorrect.");
      return;
    }
    setShowPasswordModal(false);
    if (selectedRoom) joinRoom(selectedRoom, joinPassword);
  };

  const handleSearch = async () => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return;
    setSearching(true);
    try {
      const room = await apiFetch<Room>(`/rooms/search/${q}`);
      handleRoomPress(room);
    } catch {
      Alert.alert("Room Not Found", "No room found with that code.");
    } finally {
      setSearching(false);
    }
  };

  const renderRoom = ({ item }: { item: Room }) => {
    const roomPrivate = !!item.password;
    const accentColor = roomPrivate ? colors.light.gold : colors.light.accent;
    const glowColor = roomPrivate ? colors.light.goldGlow : colors.light.emeraldGlow;

    return (
      <Pressable
        style={({ pressed }) => [styles.roomCard, pressed && styles.roomCardPressed]}
        onPress={() => handleRoomPress(item)}
      >
        <LinearGradient
          colors={roomPrivate ? ["#1E1628", "#1A1230"] : ["#0F1E28", "#0E1824"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.roomCardGradient}
        >
          {/* Decorative suit watermark */}
          <Text style={[styles.roomSuitDecor, { color: accentColor }]}>{roomPrivate ? "♦" : "♠"}</Text>

          {/* Top accent line */}
          <View style={[styles.roomAccentLine, { backgroundColor: accentColor }]} />

          {/* Card body */}
          <View style={styles.roomCardBody}>
            <View style={styles.roomCardLeft}>
              <View style={[styles.roomIconBg, { backgroundColor: glowColor, borderColor: accentColor + "30" }]}>
                <Ionicons name={roomPrivate ? "lock-closed" : "card"} size={20} color={accentColor} />
              </View>
              <View style={styles.roomCardInfo}>
                <Text style={styles.roomName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.roomChipsRow}>
                  {item.short_id && (
                    <View style={[styles.roomChip, { backgroundColor: glowColor, borderColor: accentColor + "25" }]}>
                      <Text style={[styles.roomChipText, { color: accentColor }]}>{item.short_id}</Text>
                    </View>
                  )}
                  <View style={styles.roomChip}>
                    <Text style={styles.roomChipText}>🃏 {item.cards_per_player}</Text>
                  </View>
                  <View style={styles.roomChip}>
                    <Text style={styles.roomChipText}>🔄 {item.total_rounds}</Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={[styles.joinPill, { backgroundColor: glowColor, borderColor: accentColor + "30" }]}>
              <Text style={[styles.joinPillText, { color: accentColor }]}>{roomPrivate ? "Unlock" : "Join"}</Text>
              <Ionicons name={roomPrivate ? "key" : "arrow-forward"} size={14} color={accentColor} />
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <LinearGradient
        colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header — clean: avatar+name on left, history icon on right */}
      <View style={styles.header}>
        <View style={styles.userInfoRow}>
          <Pressable onPress={() => router.push("/(home)/settings")} style={styles.avatarBtn}>
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={{ width: "100%", height: "100%", borderRadius: 22 }} />
            ) : (
              <LinearGradient colors={[colors.light.gold, colors.light.goldLight]} style={styles.avatarGradient}>
                <Text style={styles.avatarText}>{displayName ? displayName.charAt(0).toUpperCase() : "P"}</Text>
              </LinearGradient>
            )}
          </Pressable>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.username}>{displayName}</Text>
          </View>
        </View>
        <Pressable onPress={() => router.push("/(home)/history")} style={styles.headerBtn}>
          <Ionicons name="time-outline" size={22} color={colors.light.mutedForeground} />
        </Pressable>
      </View>

      {/* Hero Action Banner — Create + Join by Code grouped */}
      <View style={styles.heroBanner}>
        <LinearGradient colors={["#1A1545", "#12162E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroBannerGradient}>
          <Text style={styles.heroSuitWatermark}>♠ ♥ ♦ ♣</Text>
          <View style={styles.heroContent}>
            <View style={styles.heroTextCol}>
              <Text style={styles.heroTitle}>Ready to Play?</Text>
              <Text style={styles.heroSubtitle}>Create a new table or join with a code</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.heroCreateBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]} onPress={() => setShowCreateModal(true)}>
              <Ionicons name="add-circle" size={20} color={colors.light.background} />
              <Text style={styles.heroCreateBtnText}>New Game</Text>
            </Pressable>
          </View>
          <View style={styles.heroSearchRow}>
            <View style={styles.heroSearchPill}>
              <Ionicons name="key-outline" size={16} color={colors.light.mutedForeground} />
              <TextInput
                style={styles.heroSearchInput}
                placeholder="Enter room code"
                placeholderTextColor={colors.light.mutedForeground}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="characters"
                maxLength={6}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              {searching ? (
                <ActivityIndicator size="small" color={colors.light.gold} />
              ) : searchQuery.length > 0 ? (
                <Pressable onPress={handleSearch} style={styles.heroSearchGo}>
                  <Ionicons name="arrow-forward" size={16} color={colors.light.background} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Section title */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="game-controller" size={16} color={colors.light.gold} />
          <Text style={styles.sectionTitle}>Open Tables</Text>
        </View>
        <Text style={styles.roomCount}>{rooms.length} {rooms.length === 1 ? "room" : "rooms"}</Text>
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
          loading || !isSocketReady ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.light.gold} size="large" />
            </View>
          ) : fetchError ? (
            <View style={styles.empty}>
              <Ionicons name="warning-outline" size={48} color={colors.light.destructive} />
              <Text style={styles.emptyTitle}>Connection Error</Text>
              <Text style={[styles.emptyText, { color: colors.light.destructive }]}>{fetchError}</Text>
              <Text style={styles.emptyText}>Pull down to retry. Is the server running?</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="game-controller-outline" size={40} color={colors.light.mutedForeground} />
              </View>
              <Text style={styles.emptyTitle}>No open rooms</Text>
              <Text style={styles.emptyText}>Create a new room to get started</Text>
            </View>
          )
        }
      />

      <Modal visible={showCreateModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20, maxHeight: "90%" }]}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>New Room</Text>
              
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalLabel}>Room Name</Text>
                <TextInput
                  style={styles.modalInput}
                  value={roomName}
                  onChangeText={setRoomName}
                  placeholder="e.g. Friday Night Game"
                  placeholderTextColor={colors.light.mutedForeground}
                  autoFocus
                />
                <View style={styles.switchRow}>
                  <View style={styles.switchLabelRow}>
                    <Ionicons name="lock-closed" size={16} color={colors.light.mutedForeground} />
                    <Text style={styles.modalLabel}>Private Room</Text>
                  </View>
                  <Pressable style={[styles.switch, isPrivate && styles.switchOn]} onPress={() => setIsPrivate(!isPrivate)}>
                    <View style={[styles.switchThumb, isPrivate && styles.switchThumbOn]} />
                  </Pressable>
                </View>
                {isPrivate && (
                  <TextInput
                    style={styles.modalInput}
                    value={createPassword}
                    onChangeText={setCreatePassword}
                    placeholder="Room Password"
                    placeholderTextColor={colors.light.mutedForeground}
                    secureTextEntry
                  />
                )}
                <Text style={styles.modalLabel}>Cards per Player</Text>
                <View style={styles.stepper}>
                  <Pressable onPress={() => setCardsPerPlayer(Math.max(10, cardsPerPlayer - 1))} style={styles.stepBtn}>
                    <Ionicons name="remove" size={20} color={colors.light.foreground} />
                  </Pressable>
                  <View style={styles.stepValueBg}>
                    <Text style={styles.stepValue}>{cardsPerPlayer}</Text>
                  </View>
                  <Pressable onPress={() => setCardsPerPlayer(Math.min(15, cardsPerPlayer + 1))} style={styles.stepBtn}>
                    <Ionicons name="add" size={20} color={colors.light.foreground} />
                  </Pressable>
                </View>
                <Text style={styles.modalLabel}>Total Rounds</Text>
                <TextInput
                  style={styles.modalInput}
                  value={totalRounds.toString()}
                  onChangeText={(v) => setTotalRounds(Number(v))}
                  keyboardType="number-pad"
                />
                <View style={styles.hintRow}>
                  <Ionicons name="people" size={14} color={colors.light.mutedForeground} />
                  <Text style={styles.modalHint}>Requires 3-10 players to start</Text>
                </View>
              </ScrollView>
              
              <View style={styles.modalButtons}>
                <Pressable onPress={() => setShowCreateModal(false)} style={styles.modalCancelBtn}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={createRoom}
                  disabled={!roomName.trim() || creating}
                  style={[styles.modalCreateBtn, (!roomName.trim() || creating) && styles.buttonDisabled]}
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
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showPasswordModal} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={[styles.modalOverlay, { justifyContent: "center" }]}>
            <View style={styles.passwordModalSheet}>
              <View style={styles.passwordIconCircle}>
                <Ionicons name="lock-closed" size={24} color={colors.light.gold} />
              </View>
              <Text style={styles.modalTitle}>Enter Password</Text>
              <TextInput
                style={styles.modalInput}
                value={joinPassword}
                onChangeText={setJoinPassword}
                placeholder="Password"
                placeholderTextColor={colors.light.mutedForeground}
                secureTextEntry
                autoFocus
              />
              <View style={styles.modalButtons}>
                <Pressable onPress={() => setShowPasswordModal(false)} style={styles.modalCancelBtn}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={submitJoinPassword} style={styles.modalCreateBtn}>
                  <Text style={styles.modalCreateText}>Join</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 },
  userInfoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarBtn: { width: 44, height: 44, borderRadius: 22, overflow: "hidden" },
  avatarGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "700", color: colors.light.background, fontFamily: "Inter_700Bold" },
  greeting: { fontSize: 12, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular" },
  username: { fontSize: 20, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  headerBtn: { padding: 10, borderRadius: 14, backgroundColor: colors.light.card, borderWidth: 1, borderColor: colors.light.border },

  // Hero Banner
  heroBanner: { marginHorizontal: 20, marginBottom: 16, borderRadius: 20, overflow: "hidden" },
  heroBannerGradient: { padding: 20, borderRadius: 20, borderWidth: 1, borderColor: colors.light.border, position: "relative", overflow: "hidden" },
  heroSuitWatermark: { position: "absolute", top: -8, right: 12, fontSize: 48, color: colors.light.foreground, opacity: 0.04, fontWeight: "700", letterSpacing: 8 },
  heroContent: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  heroTextCol: { flex: 1, gap: 4 },
  heroTitle: { fontSize: 19, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  heroSubtitle: { fontSize: 13, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular" },
  heroCreateBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.light.gold, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  heroCreateBtnText: { fontSize: 14, fontWeight: "700", color: colors.light.background, fontFamily: "Inter_700Bold" },
  heroSearchRow: { marginTop: 2 },
  heroSearchPill: { flexDirection: "row", alignItems: "center", backgroundColor: colors.light.input, borderRadius: 12, borderWidth: 1, borderColor: colors.light.border, paddingHorizontal: 12, gap: 8 },
  heroSearchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.light.foreground, fontFamily: "Inter_400Regular", letterSpacing: 2 },
  heroSearchGo: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.light.gold, alignItems: "center", justifyContent: "center" },

  // Section Header
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 10 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  roomCount: { fontSize: 12, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular" },

  // Room Cards
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  roomCard: { borderRadius: 18, overflow: "hidden" },
  roomCardPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  roomCardGradient: { borderRadius: 18, borderWidth: 1, borderColor: colors.light.border, padding: 16, position: "relative", overflow: "hidden" },
  roomAccentLine: { position: "absolute", top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  roomSuitDecor: { position: "absolute", bottom: -4, right: 10, fontSize: 52, opacity: 0.06, fontWeight: "700" },
  roomCardBody: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  roomCardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  roomIconBg: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  roomCardInfo: { flex: 1, gap: 6 },
  roomName: { fontSize: 15, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  roomChipsRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  roomChip: { backgroundColor: colors.light.muted, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: colors.light.border },
  roomChipText: { fontSize: 10, fontWeight: "700", color: colors.light.mutedForeground, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  joinPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  joinPillText: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },

  // Empty State
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 14 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.light.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.light.border },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.light.foreground, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.light.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.light.border },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.light.border, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold", marginBottom: 20, textAlign: "center" },
  modalLabel: { fontSize: 14, fontWeight: "600", color: colors.light.foreground, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  modalInput: { backgroundColor: colors.light.input, borderWidth: 1, borderColor: colors.light.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.light.foreground, fontFamily: "Inter_400Regular", marginBottom: 20 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 20 },
  stepBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.light.muted, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.light.border },
  stepValueBg: { backgroundColor: colors.light.goldGlow, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.light.gold },
  stepValue: { fontSize: 22, fontWeight: "700", color: colors.light.gold, fontFamily: "Inter_700Bold", textAlign: "center" },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  modalHint: { fontSize: 12, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalCancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.light.muted, borderWidth: 1, borderColor: colors.light.border },
  modalCancelText: { fontSize: 16, fontWeight: "600", color: colors.light.mutedForeground, fontFamily: "Inter_600SemiBold" },
  modalCreateBtn: { flex: 2, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.light.gold },
  modalCreateText: { fontSize: 16, fontWeight: "700", color: colors.light.background, fontFamily: "Inter_700Bold" },
  buttonDisabled: { opacity: 0.4 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  switchLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  switch: { width: 48, height: 26, borderRadius: 13, backgroundColor: colors.light.muted, justifyContent: "center", paddingHorizontal: 3, borderWidth: 1, borderColor: colors.light.border },
  switchOn: { backgroundColor: colors.light.gold, borderColor: colors.light.gold },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.light.foreground },
  switchThumbOn: { transform: [{ translateX: 22 }], backgroundColor: colors.light.background },
  passwordModalSheet: { backgroundColor: colors.light.card, borderRadius: 24, padding: 28, width: "85%", alignSelf: "center", borderWidth: 1, borderColor: colors.light.border },
  passwordIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.light.goldGlow, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
});
