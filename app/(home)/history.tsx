import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useUser } from "@clerk/expo";
import Animated, { FadeInDown } from "react-native-reanimated";
import colors from "@/constants/colors";
import { apiFetch, ApiError } from "@/lib/api";

interface PlayerStanding {
  clerk_user_id: string;
  username: string;
  final_score: number;
  rank: number;
}

interface PlayerRoundResult {
  clerk_user_id: string;
  username: string;
  bid: number;
  collected: number;
  points_earned: number;
}

interface RoundLog {
  round_number: number;
  player_results: PlayerRoundResult[];
}

interface GameHistoryEntry {
  id: string;
  room_id: string;
  room_name: string;
  creator_id: string;
  cards_per_player: number;
  total_rounds: number;
  completed_at: string;
  players: PlayerStanding[];
  rounds: RoundLog[];
}

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  const [historyList, setHistoryList] = useState<GameHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail Modal States
  const [selectedGame, setSelectedGame] = useState<GameHistoryEntry | null>(null);
  const [selectedRoundTab, setSelectedRoundTab] = useState<number>(1);

  const myUserId = user?.id ?? "";

  const fetchHistory = useCallback(async () => {
    try {
      const data = await apiFetch<GameHistoryEntry[]>("/history");
      setHistoryList(data);
      setError(null);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      console.error("fetchHistory error:", msg);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleOpenDetails = (game: GameHistoryEntry) => {
    setSelectedGame(game);
    setSelectedRoundTab(1);
  };

  const getMyStanding = (game: GameHistoryEntry): PlayerStanding | undefined => {
    return game.players.find((p) => p.clerk_user_id === myUserId);
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return { color: "#FFD700", icon: "trophy" }; // Gold
    if (rank === 2) return { color: "#C0C0C0", icon: "medal" };  // Silver
    if (rank === 3) return { color: "#CD7F32", icon: "ribbon" }; // Bronze
    return { color: colors.light.mutedForeground, icon: "podium-outline" };
  };

  const renderGameCard = ({ item, index }: { item: GameHistoryEntry; index: number }) => {
    const myStanding = getMyStanding(item);
    const myRank = myStanding?.rank ?? 0;
    const rankInfo = getRankStyle(myRank);

    return (
      <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
        <Pressable
          onPress={() => handleOpenDetails(item)}
          style={({ pressed }) => [
            styles.card,
            pressed && styles.cardPressed,
            myRank === 1 && styles.cardWinner,
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.titleCol}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.room_name}</Text>
              <Text style={styles.cardDate}>{formatDate(item.completed_at)}</Text>
            </View>
            <View style={[styles.rankBadge, myRank === 1 && styles.rankBadgeGold]}>
              <Ionicons name={rankInfo.icon as any} size={16} color={rankInfo.color} />
              <Text style={[styles.rankText, { color: rankInfo.color }]}>
                {myRank > 0 ? `Rank #${myRank}` : "Guest"}
              </Text>
            </View>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.cardBody}>
            <View style={styles.metaInfo}>
              <Text style={styles.metaLabel}>ROUNDS</Text>
              <Text style={styles.metaValue}>{item.total_rounds}</Text>
            </View>
            <View style={styles.metaInfo}>
              <Text style={styles.metaLabel}>CARDS/PLAYER</Text>
              <Text style={styles.metaValue}>{item.cards_per_player}</Text>
            </View>
            <View style={styles.metaInfo}>
              <Text style={styles.metaLabel}>YOUR SCORE</Text>
              <Text style={[styles.metaValue, { color: colors.light.gold }]}>
                {myStanding?.final_score ?? 0} pts
              </Text>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.footerLinkText}>View Round Stats</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.light.gold} />
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  const selectedRoundResults = selectedGame?.rounds.find(
    (r) => r.round_number === selectedRoundTab
  )?.player_results ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <LinearGradient
        colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.light.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Match History</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={historyList}
        keyExtractor={(item) => item.id}
        renderItem={renderGameCard}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchHistory();
            }}
            tintColor={colors.light.gold}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.light.gold} size="large" />
            </View>
          ) : error ? (
            <View style={styles.empty}>
              <Ionicons name="warning-outline" size={48} color={colors.light.destructive} />
              <Text style={styles.emptyTitle}>Error loading history</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={48} color={colors.light.mutedForeground} />
              <Text style={styles.emptyTitle}>No games played yet</Text>
              <Text style={styles.emptyText}>Completed matches will appear here.</Text>
            </View>
          )
        }
      />

      {/* Details Modal */}
      <Modal
        visible={!!selectedGame}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedGame(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHandle} />
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedGame?.room_name}</Text>
              <Pressable onPress={() => setSelectedGame(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.light.foreground} />
              </Pressable>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              {/* Standings Sub-section */}
              <Text style={styles.sectionLabel}>Final Standings</Text>
              <View style={styles.standingsBox}>
                {selectedGame?.players
                  .sort((a, b) => a.rank - b.rank)
                  .map((player) => {
                    const rankStyle = getRankStyle(player.rank);
                    const isMe = player.clerk_user_id === myUserId;
                    return (
                      <View
                        key={player.clerk_user_id}
                        style={[
                          styles.standingRow,
                          isMe && styles.standingRowMe,
                        ]}
                      >
                        <View style={styles.standingLeft}>
                          <View
                            style={[
                              styles.rankBadgeMini,
                              { backgroundColor: rankStyle.color + "25" },
                            ]}
                          >
                            <Ionicons name={rankStyle.icon as any} size={14} color={rankStyle.color} />
                          </View>
                          <Text style={[styles.standingName, isMe && styles.standingTextGold]}>
                            {player.username} {isMe ? "(You)" : ""}
                          </Text>
                        </View>
                        <Text style={[styles.standingScore, isMe && styles.standingTextGold]}>
                          {player.final_score} pts
                        </Text>
                      </View>
                    );
                  })}
              </View>

              {/* Round-by-Round Subsection */}
              <Text style={styles.sectionLabel}>Round Statistics</Text>

              {/* Horizontal Scroll Round Tabs */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.roundTabsContainer}
                contentContainerStyle={styles.roundTabsContent}
              >
                {selectedGame?.rounds.map((round) => (
                  <Pressable
                    key={round.round_number}
                    onPress={() => setSelectedRoundTab(round.round_number)}
                    style={[
                      styles.roundTab,
                      selectedRoundTab === round.round_number && styles.roundTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roundTabText,
                        selectedRoundTab === round.round_number && styles.roundTabTextActive,
                      ]}
                    >
                      Round {round.round_number}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Selected Round Player Results Table */}
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "left" }]}>Player</Text>
                  <Text style={styles.tableHeaderCell}>Bid</Text>
                  <Text style={styles.tableHeaderCell}>Won</Text>
                  <Text style={styles.tableHeaderCell}>Pts</Text>
                </View>

                {selectedRoundResults.map((pr) => {
                  const isMe = pr.clerk_user_id === myUserId;
                  const earned = pr.points_earned;
                  return (
                    <View key={pr.clerk_user_id} style={[styles.tableRow, isMe && styles.tableRowMe]}>
                      <Text style={[styles.tableCell, { flex: 2, textAlign: "left", fontWeight: "600" }]} numberOfLines={1}>
                        {pr.username} {isMe ? "(You)" : ""}
                      </Text>
                      <Text style={styles.tableCell}>{pr.bid}</Text>
                      <Text style={styles.tableCell}>{pr.collected}</Text>
                      <Text
                        style={[
                          styles.tableCell,
                          {
                            fontWeight: "700",
                            color: earned > 0 ? colors.light.win : colors.light.mutedForeground,
                          },
                        ]}
                      >
                        +{earned}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", minHeight: 300 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.light.cardElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  list: { padding: 20, gap: 16 },
  card: {
    backgroundColor: colors.light.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 16,
    overflow: "hidden",
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  cardWinner: { borderColor: colors.light.goldDim, backgroundColor: colors.light.goldGlow },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleCol: { flex: 1, gap: 4, marginRight: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  cardDate: { fontSize: 12, color: colors.light.mutedForeground, fontFamily: "Inter_400Regular" },
  rankBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.light.muted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  rankBadgeGold: { borderColor: colors.light.goldDim, backgroundColor: "rgba(212, 168, 75, 0.1)" },
  rankText: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  cardDivider: { height: 1, backgroundColor: colors.light.border, marginVertical: 12 },
  cardBody: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaInfo: { gap: 4, flex: 1, alignItems: "center" },
  metaLabel: { fontSize: 10, fontWeight: "600", color: colors.light.mutedForeground, fontFamily: "Inter_600SemiBold" },
  metaValue: { fontSize: 15, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(37, 43, 69, 0.4)",
  },
  footerLinkText: { fontSize: 12, fontWeight: "600", color: colors.light.gold, fontFamily: "Inter_600SemiBold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.light.foreground, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, color: colors.light.mutedForeground, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.light.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.light.border,
    maxHeight: "90%",
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.light.border, alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold", flex: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.light.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: { flexGrow: 1 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.light.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 10,
  },
  standingsBox: {
    backgroundColor: colors.light.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 10,
    marginBottom: 20,
    gap: 4,
  },
  standingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  standingRowMe: { backgroundColor: colors.light.goldGlow, borderWidth: 1, borderColor: "rgba(212, 168, 75, 0.3)" },
  standingLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rankBadgeMini: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  standingName: { fontSize: 14, fontWeight: "500", color: colors.light.foreground, fontFamily: "Inter_500Medium" },
  standingScore: { fontSize: 14, fontWeight: "700", color: colors.light.foreground, fontFamily: "Inter_700Bold" },
  standingTextGold: { color: colors.light.gold, fontWeight: "700" },
  roundTabsContainer: { marginBottom: 14 },
  roundTabsContent: { gap: 10, paddingRight: 20 },
  roundTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.light.muted,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  roundTabActive: { backgroundColor: colors.light.gold, borderColor: colors.light.gold },
  roundTabText: { fontSize: 13, fontWeight: "600", color: colors.light.mutedForeground, fontFamily: "Inter_600SemiBold" },
  roundTabTextActive: { color: colors.light.background, fontWeight: "700" },
  table: {
    backgroundColor: colors.light.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    gap: 6,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
    marginBottom: 4,
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: colors.light.mutedForeground,
    textTransform: "uppercase",
    textAlign: "center",
    fontFamily: "Inter_700Bold",
  },
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderRadius: 8 },
  tableRowMe: { backgroundColor: colors.light.goldGlow },
  tableCell: { flex: 1, fontSize: 13, color: colors.light.foreground, textAlign: "center", fontFamily: "Inter_400Regular" },
});
