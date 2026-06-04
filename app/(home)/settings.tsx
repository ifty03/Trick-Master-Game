import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Switch,
  Modal,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useUser, useAuth } from "@clerk/expo";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import { useVoiceSettings } from "@/lib/voiceHelper";
import { apiFetch } from "@/lib/api";
import UserProfileWrapper from "@/components/UserProfileWrapper";
import CustomAlert from "@/components/CustomAlert";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { signOut } = useAuth();

  const { isMuted, setMuted } = useVoiceSettings();

  const [updatingAvatar, setUpdatingAvatar] = useState(false);

  // Alert State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    title: string;
    message: string;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  const showAlert = (type: "success" | "error" | "info", title: string, message: string) => {
    setAlertConfig({ visible: true, type, title, message });
  };

  const handlePickAvatar = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showAlert("error", "Permission Denied", "We need access to your photos to upload a profile picture.");
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.2,
      base64: true,
    });

    if (pickerResult.canceled || !pickerResult.assets?.[0]) {
      return;
    }

    setUpdatingAvatar(true);
    try {
      const asset = pickerResult.assets[0];
      if (!asset.base64) {
        throw new Error("Failed to retrieve image data");
      }

      const mimeType = asset.mimeType || "image/jpeg";
      const fileData = `data:${mimeType};base64,${asset.base64}`;

      await user?.setProfileImage({ file: fileData });

      const updatedEmail = user?.emailAddresses[0]?.emailAddress || "";
      const updatedUsername = user?.firstName || user?.username || "Player";

      await apiFetch("/profiles/sync", {
        method: "POST",
        body: JSON.stringify({
          username: updatedUsername,
          email: updatedEmail,
          avatarUrl: user?.imageUrl,
        }),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("success", "Success", "Profile image updated successfully!");
    } catch (e: any) {
      console.error("Avatar update error:", e);
      showAlert("error", "Error", e?.message || "Failed to update profile image");
    } finally {
      setUpdatingAvatar(false);
    }
  };

  // Modal Visibility States
  const [rulesVisible, setRulesVisible] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);

  const email = user?.emailAddresses[0]?.emailAddress ?? "Guest Session";
  const emailPrefix = user?.emailAddresses[0]?.emailAddress?.split("@")[0] || "";
  const username = user?.firstName || user?.username || emailPrefix || "Player";

  const handleToggleVoice = (value: boolean) => {
    // Note: voice mute state is stored as "isMuted". So if voice is ENABLED, isMuted is FALSE.
    setMuted(!value);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <LinearGradient
        colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.light.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Pressable onPress={handlePickAvatar} disabled={updatingAvatar} style={styles.avatarPressable}>
            {updatingAvatar ? (
              <View style={styles.avatarLoadingContainer}>
                <ActivityIndicator color={colors.light.gold} size="small" />
              </View>
            ) : user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={styles.profileAvatarImage} />
            ) : (
              <LinearGradient
                colors={[colors.light.gold, colors.light.goldLight]}
                style={styles.profileAvatarGradient}
              >
                <Text style={styles.profileAvatarText}>
                  {username.charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            )}
            <View style={styles.cameraIconBadge}>
              <Ionicons name="camera" size={10} color={colors.light.background} />
            </View>
          </Pressable>
          <View style={styles.profileInfo}>
            <Text style={styles.profileUsername}>{username}</Text>
            <Text style={styles.profileEmail} numberOfLines={1}>{email}</Text>
            <Text style={styles.profileHelpText}>Tap image to change</Text>
          </View>
        </View>

        {/* Account Details / Clerk UserProfile Component */}
        <UserProfileWrapper />

        {/* Section: Game Settings */}
        <Text style={styles.sectionTitle}>Game Options</Text>
        <View style={styles.optionsBlock}>
          <View style={styles.optionRow}>
            <View style={styles.optionLeft}>
              <View style={[styles.optionIconContainer, { backgroundColor: "rgba(139, 92, 246, 0.15)" }]}>
                <Ionicons name="volume-high-outline" size={20} color={colors.light.purple} />
              </View>
              <View style={styles.optionTexts}>
                <Text style={styles.optionLabel}>Voice Feedback</Text>
                <Text style={styles.optionSublabel}>Narrates dealer turns and card tricks</Text>
              </View>
            </View>
            <Switch
              value={!isMuted}
              onValueChange={handleToggleVoice}
              trackColor={{ false: colors.light.muted, true: colors.light.gold }}
              thumbColor={colors.light.text}
            />
          </View>
        </View>

        {/* Section: Information & Legal */}
        <Text style={styles.sectionTitle}>Information & Legal</Text>
        <View style={styles.optionsBlock}>
          {/* Option: Game Rules */}
          <Pressable onPress={() => setRulesVisible(true)} style={styles.optionRowClickable}>
            <View style={styles.optionLeft}>
              <View style={[styles.optionIconContainer, { backgroundColor: "rgba(45, 212, 168, 0.15)" }]}>
                <Ionicons name="book-outline" size={20} color={colors.light.accent} />
              </View>
              <View style={styles.optionTexts}>
                <Text style={styles.optionLabel}>How to Play & Rules</Text>
                <Text style={styles.optionSublabel}>Learn the card bidding and score rules</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.light.mutedForeground} />
          </Pressable>

          <View style={styles.optionDivider} />

          {/* Option: Terms of Service */}
          <Pressable onPress={() => setTermsVisible(true)} style={styles.optionRowClickable}>
            <View style={styles.optionLeft}>
              <View style={[styles.optionIconContainer, { backgroundColor: "rgba(212, 168, 75, 0.15)" }]}>
                <Ionicons name="document-text-outline" size={20} color={colors.light.gold} />
              </View>
              <View style={styles.optionTexts}>
                <Text style={styles.optionLabel}>Terms & Conditions</Text>
                <Text style={styles.optionSublabel}>User agreement and game licenses</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.light.mutedForeground} />
          </Pressable>

          <View style={styles.optionDivider} />

          {/* Option: Privacy Policy */}
          <Pressable onPress={() => setPrivacyVisible(true)} style={styles.optionRowClickable}>
            <View style={styles.optionLeft}>
              <View style={[styles.optionIconContainer, { backgroundColor: "rgba(212, 168, 75, 0.15)" }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.light.gold} />
              </View>
              <View style={styles.optionTexts}>
                <Text style={styles.optionLabel}>Privacy Policy</Text>
                <Text style={styles.optionSublabel}>Data security and authentication practices</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.light.mutedForeground} />
          </Pressable>
        </View>

        {/* Section: Account Actions */}
        <Text style={styles.sectionTitle}>Account</Text>
        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color={colors.light.destructive} />
          <Text style={styles.logoutBtnText}>Log Out</Text>
        </Pressable>
      </ScrollView>

      {/* MODAL 1: Game Rules */}
      <Modal visible={rulesVisible} transparent animationType="slide" onRequestClose={() => setRulesVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>How to Play & Rules</Text>
              <Pressable onPress={() => setRulesVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.light.foreground} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.ruleSection}>1. Game Concept</Text>
              <Text style={styles.ruleText}>
                Trick Master is a competitive trick-taking card game. Unlike traditional card games that use suits (hearts, spades, etc.), Trick Master uses a unique numeric deck consisting of incremental card values (increments of 5: e.g. 5, 10, 15, 20...).
              </Text>

              <Text style={styles.ruleSection}>2. Game Phases</Text>
              <Text style={styles.ruleText}>
                • <Text style={{ fontWeight: "700" }}>Dealing:</Text> Each player is dealt a hand of numeric cards based on room settings.{"\n"}
                • <Text style={{ fontWeight: "700" }}>Bidding:</Text> Players inspect their hands and submit a bid, predicting how many card points they think they can collect in the round.{"\n"}
                • <Text style={{ fontWeight: "700" }}>Playing:</Text> Starting from the seat next to the dealer, players take turns playing a card from their hand. The player who plays the highest card value wins the trick!{"\n"}
                • <Text style={{ fontWeight: "700" }}>Scoring:</Text> Round outcomes are verified and scores are tallied.
              </Text>

              <Text style={styles.ruleSection}>3. Unique Scoring Rules</Text>
              <Text style={styles.ruleText}>
                In Trick Master, winning is calculated by comparing the sum of trick values collected against the player's initial bid. If you collect trick card points equal to or exceeding your bid, you score positive points. Overbidding or failing to collect enough trick values results in scoring penalties!
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Terms & Conditions */}
      <Modal visible={termsVisible} transparent animationType="slide" onRequestClose={() => setTermsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Terms & Conditions</Text>
              <Pressable onPress={() => setTermsVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.light.foreground} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.legalDate}>Last Updated: June 2026</Text>
              <Text style={styles.ruleText}>
                Welcome to Trick Master Game. By creating an account and participating in multiplayer matches, you agree to these Terms and Conditions.
              </Text>
              <Text style={styles.ruleSection}>User Account Security</Text>
              <Text style={styles.ruleText}>
                Accounts are managed securely via Clerk authentication. You are responsible for maintaining the confidentiality of your session keys and account tokens. Abuse, hacking, or denial-of-service attempts will lead to immediate account termination.
              </Text>
              <Text style={styles.ruleSection}>Limitation of Liability</Text>
              <Text style={styles.ruleText}>
                The game service is provided on an "as-is" and "as-available" basis. We are not liable for network latency, server downtime, socket disconnection, or lost database game statistics on the free hosting tiers.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: Privacy Policy */}
      <Modal visible={privacyVisible} transparent animationType="slide" onRequestClose={() => setPrivacyVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Privacy Policy</Text>
              <Pressable onPress={() => setPrivacyVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.light.foreground} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.legalDate}>Last Updated: June 2026</Text>
              <Text style={styles.ruleText}>
                Your privacy is important to us. This policy describes how we collect, process, and protect your information.
              </Text>
              <Text style={styles.ruleSection}>Data Collection & Usage</Text>
              <Text style={styles.ruleText}>
                We sync your email address and username from Clerk to populate local database profile records and rankings. This data is used solely to run room matches and display standings.
              </Text>
              <Text style={styles.ruleSection}>Third-Party Services</Text>
              <Text style={styles.ruleText}>
                We do not sell, trade, or share user profile data. Third-party authentication (Clerk) and database services (MongoDB Atlas) handle user data securely in accordance with their respective compliance policies.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
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
  scrollContent: { padding: 20, gap: 20 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.light.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 16,
    gap: 16,
  },
  avatarPressable: {
    position: "relative",
    width: 60,
    height: 60,
  },
  avatarLoadingContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.light.muted,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  profileAvatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.light.border,
  },
  cameraIconBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.light.gold,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.light.card,
  },
  profileAvatarGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.light.background,
    fontFamily: "Inter_700Bold",
  },
  profileHelpText: {
    fontSize: 11,
    color: colors.light.gold,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
  profileInfo: { flex: 1, gap: 4 },
  profileUsername: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
  },
  profileEmail: {
    fontSize: 13,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.light.gold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: -8,
  },
  optionsBlock: {
    backgroundColor: colors.light.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.light.border,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  optionRowClickable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  optionLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  optionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTexts: { gap: 2, flex: 1 },
  optionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.light.foreground,
    fontFamily: "Inter_600SemiBold",
  },
  optionSublabel: {
    fontSize: 12,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
  },
  optionDivider: { height: 1, backgroundColor: colors.light.border, marginLeft: 70 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 10,
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.light.destructive,
    fontFamily: "Inter_600SemiBold",
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.light.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.light.border,
    maxHeight: "85%",
  },
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
  ruleSection: { fontSize: 16, fontWeight: "700", color: colors.light.gold, marginTop: 16, marginBottom: 8, fontFamily: "Inter_700Bold" },
  ruleText: { fontSize: 14, color: colors.light.foreground, lineHeight: 22, fontFamily: "Inter_400Regular", marginBottom: 12 },
  legalDate: { fontSize: 12, color: colors.light.mutedForeground, marginBottom: 14, fontFamily: "Inter_400Regular" },
});
