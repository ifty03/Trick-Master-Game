import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useUser } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import { apiFetch } from "@/lib/api";
import colors from "@/constants/colors";
import CustomAlert from "@/components/CustomAlert";

export default function UserProfileWrapper() {
  const { user } = useUser();
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (user) {
      // Fallback to email username if Clerk username is null/empty
      const emailPrefix = user.emailAddresses[0]?.emailAddress?.split("@")[0] || "";
      setUsername(user.username || emailPrefix || "Player");
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
    }
  }, [user]);

  if (!user) return null;

  const handleSave = async () => {
    if (!firstName.trim()) {
      showAlert("error", "Error", "First Name cannot be empty");
      return;
    }
    setLoading(true);
    try {
      const email = user.emailAddresses[0]?.emailAddress || "";
      const displayName = firstName.trim();

      // 1. Sync/Update details in the MongoDB backend first (validates uniqueness of display name/first name)
      await apiFetch("/profiles/sync", {
        method: "POST",
        body: JSON.stringify({
          username: displayName,
          email: email,
          avatarUrl: user.imageUrl,
        }),
      });

      // 2. Only if DB update succeeds, update Clerk details (username is read-only)
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("success", "Success", "Profile details updated successfully!");
    } catch (e: any) {
      console.error("Update profile error:", e);
      showAlert("error", "Error", e?.message || "Failed to update profile details");
    } finally {
      setLoading(false);
    }
  };

  const email = user.emailAddresses[0]?.emailAddress || "No email linked";

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Account Details</Text>
      
      <View style={styles.formCard}>
        {/* Username */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Username (Read-Only)</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={username}
            editable={false}
            selectTextOnFocus={false}
          />
        </View>

        {/* First Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>First Name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First Name"
            placeholderTextColor={colors.light.mutedForeground}
          />
        </View>

        {/* Last Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last Name"
            placeholderTextColor={colors.light.mutedForeground}
          />
        </View>

        {/* Email (Read-Only) */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email Address (Read-Only)</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={email}
            editable={false}
            selectTextOnFocus={false}
          />
        </View>

        {/* Save Button */}
        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            loading && styles.saveBtnDisabled,
          ]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.light.background} size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </Pressable>
      </View>

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
  container: {
    width: "100%",
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.light.gold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  formCard: {
    backgroundColor: colors.light.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 16,
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.light.mutedForeground,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    backgroundColor: colors.light.background,
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.light.foreground,
    fontFamily: "Inter_400Regular",
  },
  inputDisabled: {
    opacity: 0.65,
    backgroundColor: colors.light.muted,
  },
  saveBtn: {
    backgroundColor: colors.light.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  saveBtnDisabled: {
    backgroundColor: colors.light.muted,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.light.background,
    fontFamily: "Inter_700Bold",
  },
});
