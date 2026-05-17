import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSignUp } from "@clerk/expo";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import colors from "@/constants/colors";

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [generalError, setGeneralError] = useState<string | null>(null);

  const handleSignUp = async () => {
    setGeneralError(null);
    try {
      const { error } = await signUp.password({ emailAddress: email, password });
      if (error) {
        console.error("sign-up error:", JSON.stringify(error));
        return;
      }
      if (!error) await signUp.verifications.sendEmailCode();
    } catch (e: any) {
      console.error("sign-up exception:", e);
      setGeneralError(e?.message || "Sign up failed. Please try again.");
    }
  };

  const handleVerify = async () => {
    setGeneralError(null);
    try {
      await signUp.verifications.verifyEmailCode({ code: verificationCode });
      if (signUp.status === "complete") {
        await signUp.finalize({ navigate: () => {} });
      }
    } catch (e: any) {
      console.error("verify exception:", e);
      setGeneralError(e?.message || "Verification failed.");
    }
  };

  if (
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields?.includes("email_address") &&
    signUp.missingFields?.length === 0
  ) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
          <View style={styles.logoCircle}>
            <Ionicons name="mail-outline" size={32} color={colors.light.gold} />
          </View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a code to{"\n"}<Text style={{ color: colors.light.foreground, fontFamily: "Inter_600SemiBold" }}>{email}</Text>
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Verification code</Text>
            <TextInput
              style={styles.input}
              value={verificationCode}
              onChangeText={setVerificationCode}
              placeholder="6-digit code"
              placeholderTextColor={colors.light.mutedForeground}
              keyboardType="numeric"
              autoFocus
            />
            {errors?.fields?.code && (
              <Text style={styles.fieldError}>{errors.fields.code.message}</Text>
            )}
            {generalError && <Text style={styles.fieldError}>{generalError}</Text>}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                (!verificationCode || fetchStatus === "fetching") && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleVerify}
              disabled={!verificationCode || fetchStatus === "fetching"}
            >
              {fetchStatus === "fetching" ? (
                <ActivityIndicator color={colors.light.background} />
              ) : (
                <Text style={styles.buttonText}>Verify Email</Text>
              )}
            </Pressable>

            <Pressable onPress={() => signUp.verifications.sendEmailCode()} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Resend code</Text>
            </Pressable>
          </View>

          <View nativeID="clerk-captcha" />
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoCircle}>
          <Ionicons name="diamond" size={36} color={colors.light.gold} />
        </View>

        <Text style={styles.appName}>TrickMaster</Text>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Join the table and start playing</Text>

        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.light.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {errors?.fields?.emailAddress && (
              <Text style={styles.fieldError}>{errors.fields.emailAddress.message}</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.light.mutedForeground}
                secureTextEntry={!showPassword}
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.light.mutedForeground}
                />
              </Pressable>
            </View>
            {errors?.fields?.password && (
              <Text style={styles.fieldError}>{errors.fields.password.message}</Text>
            )}
          </View>

          {generalError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.light.destructive} />
              <Text style={styles.errorBannerText}>{generalError}</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              (!email || !password || fetchStatus === "fetching") && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleSignUp}
            disabled={!email || !password || fetchStatus === "fetching"}
          >
            {fetchStatus === "fetching" ? (
              <ActivityIndicator color={colors.light.background} />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </Pressable>

          <View nativeID="clerk-captcha" />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/sign-in">
            <Text style={styles.link}>Sign in</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.light.background },
  container: {
    flexGrow: 1,
    backgroundColor: colors.light.background,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.light.card,
    borderWidth: 1.5,
    borderColor: colors.light.gold,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  appName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.light.gold,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.light.foreground,
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: colors.light.mutedForeground,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    marginBottom: 28,
  },
  card: {
    width: "100%",
    backgroundColor: colors.light.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 20,
    gap: 16,
    marginBottom: 24,
  },
  inputGroup: { gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.light.foreground,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    backgroundColor: colors.light.input,
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.light.foreground,
    fontFamily: "Inter_400Regular",
    width: "100%",
  },
  passwordRow: { position: "relative" },
  passwordInput: { paddingRight: 48 },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  fieldError: {
    fontSize: 12,
    color: colors.light.destructive,
    fontFamily: "Inter_400Regular",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${colors.light.destructive}18`,
    borderRadius: 8,
    padding: 10,
  },
  errorBannerText: {
    fontSize: 13,
    color: colors.light.destructive,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  button: {
    backgroundColor: colors.light.gold,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.8 },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.light.background,
    fontFamily: "Inter_700Bold",
  },
  secondaryBtn: { alignItems: "center", paddingVertical: 8 },
  secondaryBtnText: {
    color: colors.light.gold,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    color: colors.light.mutedForeground,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  link: {
    color: colors.light.gold,
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});
