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
  Alert,
} from "react-native";
import { useSignIn, useOAuth } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

WebBrowser.maybeCompleteAuthSession();
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import colors from "@/constants/colors";

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [generalError, setGeneralError] = useState<string | null>(null);

  const onSelectAuth = async () => {
    try {
      const { createdSessionId, signIn: oauthSignIn, signUp: oauthSignUp, setActive: oauthSetActive } = await startOAuthFlow({
        redirectUrl: Linking.createURL("/oauth-callback", { scheme: "trickmaster" })
      });
      if (createdSessionId && oauthSetActive) {
        await oauthSetActive({ session: createdSessionId });
        router.replace("/(home)/lobby");
      }
    } catch (err: any) {
      console.error("OAuth error", err);
      const errMsg = err?.message || String(err);
      if (errMsg.includes("No matching browser activity") || errMsg.includes("openBrowserAsync")) {
        setGeneralError("No web browser detected on this device. Please install or enable a web browser (e.g., Google Chrome) to use Google Sign In.");
      } else {
        setGeneralError("Failed to authenticate with Google");
      }
    }
  };

  const handleSignIn = async () => {
    if (!signIn) return;
    setGeneralError(null);
    try {
      // Step 1: Create the sign-in attempt with email
      const res = await signIn.create({ identifier: email });
      if (res.error) {
        console.error("sign-in create error:", JSON.stringify(res.error));
        setGeneralError(res.error.longMessage || res.error.message || "Sign in failed.");
        return;
      }

      // Step 2: Authenticate password
      const passRes = await signIn.password({ password });
      if (passRes.error) {
        console.error("sign-in password error:", JSON.stringify(passRes.error));
        setGeneralError(passRes.error.longMessage || passRes.error.message || "Sign in failed.");
        return;
      }

      // Step 3: Check status and finalize or request verification
      if (signIn.status === "complete") {
        const finalizeRes = await signIn.finalize();
        if (finalizeRes.error) {
          setGeneralError(finalizeRes.error.longMessage || finalizeRes.error.message || "Failed to finalize session.");
        } else {
          router.replace("/(home)/lobby");
        }
      } else if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
        const emailCodeFactor = signIn.supportedSecondFactors?.find(
          (f) => f.strategy === "email_code"
        );
        if (emailCodeFactor) {
          const sendRes = await signIn.mfa.sendEmailCode();
          if (sendRes.error) {
            setGeneralError(sendRes.error.longMessage || sendRes.error.message || "Failed to send code.");
          }
        } else {
          const phoneCodeFactor = signIn.supportedSecondFactors?.find(
            (f) => f.strategy === "phone_code"
          );
          if (phoneCodeFactor) {
            const sendRes = await signIn.mfa.sendPhoneCode();
            if (sendRes.error) {
              setGeneralError(sendRes.error.longMessage || sendRes.error.message || "Failed to send SMS code.");
            }
          } else {
            setGeneralError(`MFA verification strategy not supported. Factors: ${JSON.stringify(signIn.supportedSecondFactors)}`);
          }
        }
      } else {
        setGeneralError(`Authentication required: ${signIn.status}`);
      }
    } catch (e: any) {
      console.error("sign-in exception:", e);
      setGeneralError(e?.message || "Sign in failed. Please try again.");
    }
  };

  const handleVerify = async () => {
    if (!signIn) return;
    setGeneralError(null);
    try {
      const emailCodeFactor = signIn.supportedSecondFactors?.find(
        (f) => f.strategy === "email_code"
      );
      const phoneCodeFactor = signIn.supportedSecondFactors?.find(
        (f) => f.strategy === "phone_code"
      );

      let res;
      if (emailCodeFactor) {
        res = await signIn.mfa.verifyEmailCode({ code });
      } else if (phoneCodeFactor) {
        res = await signIn.mfa.verifyPhoneCode({ code });
      } else {
        setGeneralError("No supported MFA verification strategy found.");
        return;
      }

      if (res.error) {
        setGeneralError(res.error.longMessage || res.error.message || "Verification failed.");
        return;
      }
      if (signIn.status === "complete") {
        const finalizeRes = await signIn.finalize();
        if (finalizeRes.error) {
          setGeneralError(finalizeRes.error.longMessage || finalizeRes.error.message || "Failed to finalize session.");
        } else {
          router.replace("/(home)/lobby");
        }
      }
    } catch (e: any) {
      console.error("verify exception:", e);
      setGeneralError(e?.message || "Verification failed.");
    }
  };

  const handleResendCode = async () => {
    if (!signIn) return;
    setGeneralError(null);
    try {
      const emailCodeFactor = signIn.supportedSecondFactors?.find(
        (f) => f.strategy === "email_code"
      );
      const phoneCodeFactor = signIn.supportedSecondFactors?.find(
        (f) => f.strategy === "phone_code"
      );

      let res;
      if (emailCodeFactor) {
        res = await signIn.mfa.sendEmailCode();
      } else if (phoneCodeFactor) {
        res = await signIn.mfa.sendPhoneCode();
      } else {
        setGeneralError("No supported MFA verification strategy found.");
        return;
      }

      if (res.error) {
        setGeneralError(res.error.longMessage || res.error.message || "Failed to resend code.");
      }
    } catch (e: any) {
      console.error("resend code exception:", e);
      setGeneralError(e?.message || "Failed to resend code.");
    }
  };

  const handleStartOver = async () => {
    if (!signIn) return;
    setGeneralError(null);
    setCode("");
    try {
      await signIn.reset();
    } catch (e: any) {
      console.error("reset exception:", e);
    }
  };

  if (!signIn) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.light.background }}>
        <ActivityIndicator color={colors.light.gold} size="large" />
      </View>
    );
  }

  if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <LinearGradient
          colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
          <View style={styles.logoCircle}>
            <Ionicons name="mail-outline" size={32} color={colors.light.gold} />
          </View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>Enter the verification code we sent to {email}</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Verification code</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
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
                (!code || fetchStatus === "fetching") && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleVerify}
              disabled={!code || fetchStatus === "fetching"}
            >
              {fetchStatus === "fetching" ? (
                <ActivityIndicator color={colors.light.background} />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </Pressable>

            <Pressable onPress={handleResendCode} style={styles.secondaryBtn} disabled={fetchStatus === "fetching"}>
              <Text style={styles.secondaryBtnText}>Resend code</Text>
            </Pressable>
            <Pressable onPress={handleStartOver} style={styles.secondaryBtn} disabled={fetchStatus === "fetching"}>
              <Text style={styles.secondaryBtnText}>Start over</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient
        colors={[colors.light.gradientStart, colors.light.gradientMid, colors.light.gradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Decorative card suit symbols */}
        <View style={styles.suitRow}>
          <Text style={styles.suitSymbol}>♠</Text>
          <Text style={[styles.suitSymbol, { color: colors.light.destructive }]}>♥</Text>
          <Text style={styles.suitSymbol}>♣</Text>
          <Text style={[styles.suitSymbol, { color: colors.light.destructive }]}>♦</Text>
        </View>

        <View style={styles.logoCircle}>
          <Ionicons name="diamond" size={36} color={colors.light.gold} />
        </View>

        <Text style={styles.appName}>Trick Master</Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue playing</Text>

        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={colors.light.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.inputWithIcon}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.light.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {errors?.fields?.identifier && (
              <Text style={styles.fieldError}>{errors.fields.identifier.message}</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.light.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.inputWithIcon, { paddingRight: 48 }]}
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
            onPress={handleSignIn}
            disabled={!email || !password || fetchStatus === "fetching"}
          >
            {fetchStatus === "fetching" ? (
              <ActivityIndicator color={colors.light.background} />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </Pressable>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <Pressable style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.8 }]} onPress={onSelectAuth}>
            <Ionicons name="logo-google" size={20} color={colors.light.foreground} />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up">
            <Text style={styles.link}>Sign up</Text>
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
    paddingHorizontal: 24,
    alignItems: "center",
  },
  suitRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
    opacity: 0.25,
  },
  suitSymbol: {
    fontSize: 28,
    color: colors.light.foreground,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.light.goldGlow,
    borderWidth: 2,
    borderColor: colors.light.gold,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: colors.light.gold,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  appName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.light.gold,
    letterSpacing: 3,
    textTransform: "uppercase",
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 24,
    gap: 18,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  inputGroup: { gap: 8 },
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
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.light.foreground,
    fontFamily: "Inter_400Regular",
    width: "100%",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.light.input,
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
  },
  inputIcon: {
    paddingLeft: 14,
  },
  inputWithIcon: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.light.foreground,
    fontFamily: "Inter_400Regular",
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
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: `${colors.light.destructive}30`,
  },
  errorBannerText: {
    fontSize: 13,
    color: colors.light.destructive,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  button: {
    backgroundColor: colors.light.gold,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
    shadowColor: colors.light.gold,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.4, shadowOpacity: 0 },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.light.background,
    fontFamily: "Inter_700Bold",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.light.border,
  },
  dividerText: {
    marginHorizontal: 14,
    fontSize: 12,
    color: colors.light.mutedForeground,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: colors.light.cardElevated,
    gap: 12,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.light.foreground,
    fontFamily: "Inter_600SemiBold",
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
