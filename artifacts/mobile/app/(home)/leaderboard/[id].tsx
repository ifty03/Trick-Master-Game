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
import { useUser } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import colors from "@/constants/colors";
import { useAuthContext } from "@/context/AuthContext";
import type { LeaderboardEntry, RoomPlayer, GameState } from "@/types/game";

export default function LeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { getClient } = useAuthContext();
  const insets = useSafeAreaInsets();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const client = getClient();
        const [playersRes, gsRes] = await Promise.all([
          client.from("room_players").select("*").eq("room_id", id).order("seat_order"),
          client.from("game_states").select("*").eq("room_id", id).single(),
        ]);

        if (!playersRes.data || !gsRes.data) return;
        const players = playersRes.data as RoomPlayer[];
        const gs = gsRes.data as GameState;

        const entries: LeaderboardEntry[] = players
          .map((p) => ({
            clerk_user_id: p.clerk_user_id,
            username: p.username,
            total_score: gs.scores[p.clerk_user_id] ?? 0,
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

  const backToLobby = () => {
    router.replace("/(home)/lobby");
  };

  const rankColors: Record<number, string> = {
    1: "#FFD700",
    2: "#C0C0C0",
    3: "#CD7F32",
  };

  const rankIcons: Record<number, string> = {
    1: "trophy",
    2: "medal",
    3: "ribbon",
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.light.gold} size="large" />
      </View>
    );
  }

  const myEntry = leaderboard.find((e) => e.clerk_user_id === user?.id);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0), paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Game Over</Text>
        <Text style={styles.subtitle}>Final Results</Text>
      </View>

      {myEntry && (
        <Animated.View entering={FadeInDown.delay(100)} style={styles.myResultCard}>
          <Text style={styles.myResultLabel}>Your Result</Text>
          <Text style={styles.myRank}>#{myEntry.rank}</Text>
          <Text style={styles.myScore}>{myEntry.total_score} pts</Text>
        </Animated.View>
      )}

      <FlatList
        data={leaderboard}
        keyExtractor={(item) => item.clerk_user_id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(200 + index * 80)}>
            <View style={[
              styles.rankRow,
              item.clerk_user_id === user?.id && styles.rankRowMe,
            ]}>
              <View style={[
                styles.rankBadge,
                { backgroundColor: rankColors[item.rank] ?? colors.light.muted },
              ]}>
                {rankIcons[item.rank] ? (
                  <Ionicons
                    name={rankIcons[item.rank] as any}
                    size={16}
                    color={item.rank === 1 ? "#1A1A1A" : "#FFFFFF"}
                  />
                ) : (
                  <Text style={styles.rankNumber}>{item.rank}</Text>
                )}
              </View>
              <Text style={styles.rankName}>
                {item.username}
                {item.clerk_user_id === user?.id ? " (You)" : ""}
              </Text>
              <Text style={[
                styles.rankScore,
                item.rank === 1 && { color: colors.light.gold },
              ]}>
                {item.total_score} pts
              </Text>
            </View>
          </Animated.View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable
          onPress={backToLobby}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="home" size={18} color={colors.light.background} />
          <Text style={styles.backBtnText}>Back to Lobby</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.light.background },
  header: { alignItems: "center", paddingTop: 24, paddingBottom: 16 },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 16,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
  },
  myResultCard: {
    margin: 16,
    backgroundColor: colors.light.card,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.light.gold,
    padding: 24,
    alignItems: "center",
    gap: 4,
  },
  myResultLabel: {
    fontSize: 12,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  myRank: {
    fontSize: 48,
    fontWeight: "700",
    color: colors.light.gold,
    fontFamily: "Inter_700Bold",
  },
  myScore: {
    fontSize: 22,
    fontWeight: "600",
    color: colors.light.foreground,
    fontFamily: "Inter_600SemiBold",
  },
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 20 },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.light.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
  },
  rankRowMe: {
    borderColor: colors.light.gold,
    backgroundColor: "#1E1A0A",
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  rankName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.light.foreground,
    fontFamily: "Inter_600SemiBold",
  },
  rankScore: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.light.gold,
    borderRadius: 14,
    paddingVertical: 16,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.light.background,
    fontFamily: "Inter_700Bold",
  },
});
