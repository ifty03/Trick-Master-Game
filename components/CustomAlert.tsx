import React from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "@/constants/colors";

interface CustomAlertProps {
  visible: boolean;
  type: "success" | "error" | "info";
  title: string;
  message: string;
  onClose: () => void;
}

export default function CustomAlert({
  visible,
  type,
  title,
  message,
  onClose,
}: CustomAlertProps) {
  const isSuccess = type === "success";
  const isError = type === "error";

  const getIconName = () => {
    if (isSuccess) return "checkmark-circle-outline";
    if (isError) return "alert-circle-outline";
    return "information-circle-outline";
  };

  const getIconColor = () => {
    if (isSuccess) return colors.light.accent; // green/cyan
    if (isError) return colors.light.destructive; // red
    return colors.light.gold; // gold
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Icon Badge */}
          <View style={[styles.iconContainer, { borderColor: getIconColor() }]}>
            <Ionicons name={getIconName()} size={44} color={getIconColor()} />
          </View>

          {/* Title & Message */}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {/* Action Button */}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            ]}
            onPress={onClose}
          >
            <Text style={styles.buttonText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: colors.light.card,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.light.border,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.light.foreground,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    width: "100%",
    backgroundColor: colors.light.gold,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.light.background,
    fontFamily: "Inter_700Bold",
  },
});
