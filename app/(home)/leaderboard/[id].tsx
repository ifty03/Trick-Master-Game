import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import colors from "@/constants/colors";
import { apiFetch } from "@/lib/api";
import type { LeaderboardEntry, RoomPlayer, GameState } from "@/types/game";

export default function LeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const data = await apiFetch<{ players: RoomPlayer[]; game_state: GameState | null }>(`/game/${id}`);
        if (!data.players || !data.game_state) return;

        const entries: LeaderboardEntry[] = data.players
          .map((p) => ({
            clerk_user_id: p.clerk_user_id,
            username: p.username,
            total_score: data.game_state!.scores[p.clerk_user_id] ?? 0,
            rank: 0,
          }))
          .sort((a, b) => b.total_score - a.total_score)
          .map((e, i) => ({ ...e, rank: i + 1 }));

        setLeaderboard(entries);
      } catch (e) {
        console.error("leaderboard error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const backToLobby = () => router.replace("/(home)/lobby");

  const rankColors: Record<number, string> = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };
  const rankIcons: Record<number, string> = { 1: "trophy", 2: "medal", 3: "ribbon" };

  if (loading) {
    return (
      <View style={styles.center}>
        <LinearGradient colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color={colors.light.gold} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0), paddingBottom: insets.bottom + 20 }]}>
      <LinearGradient colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Ionicons name="trophy" size={32} color={colors.light.gold} />
        <Text style={styles.title}>Final Standings</Text>
        <Text style={styles.subtitle}>Game complete</Text>
      </View>

      <FlatList
        data={leaderboard}
        keyExtractor={(item) => item.clerk_user_id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
            <View style={[styles.row, item.rank <= 3 && styles.rowTop]}>
              <View style={[styles.rankCircle, { backgroundColor: rankColors[item.rank] ?? colors.light.muted }]}>
                {item.rank <= 3 ? (
                  <Ionicons name={rankIcons[item.rank] as "trophy"} size={18} color={colors.light.background} />
                ) : (
                  <Text style={styles.rankNum}>{item.rank}</Text>
                )}
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{item.username}</Text>
                <Text style={styles.rowScore}>{item.total_score} points</Text>
              </View>
            </View>
          </Animated.View>
        )}
      />

      <Pressable onPress={backToLobby} style={styles.backBtn}>
        <Text style={styles.backBtnText}>Back to Lobby</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { alignItems: "center", paddingVertical: 24, gap: 8 },
  title: { fontSize: 26, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular" },
  list: { paddingHorizontal: 20, gap: 10, paddingBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.light.border },
  rowTop: { borderColor: colors.light.goldDim, backgroundColor: colors.light.goldGlow },
  rankCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  rankNum: { fontSize: 16, fontWeight: "700", color: colors.light.background, fontFamily: "Inter_700Bold" },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: "600", color: colors.light.foreground, fontFamily: "Inter_600SemiBold" },
  rowScore: { fontSize: 13, color: colors.light.gold, fontFamily: "Inter_400Regular", marginTop: 2 },
  backBtn: { marginHorizontal: 20, backgroundColor: colors.light.gold, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  backBtnText: { fontSize: 16, fontWeight: "700", color: colors.light.background, fontFamily: "Inter_700Bold" },
});
