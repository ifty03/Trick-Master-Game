import * as Speech from "expo-speech";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";

const SECURE_STORE_KEY = "voice_feedback_muted";

let globalMuted = false;
const listeners = new Set<(muted: boolean) => void>();

// Load initial mute value asynchronously
SecureStore.getItemAsync(SECURE_STORE_KEY)
  .then((val) => {
    if (val !== null) {
      globalMuted = val === "true";
      listeners.forEach((l) => l(globalMuted));
    }
  })
  .catch((err) => console.error("Failed to load voice muted setting", err));

// Human-like voice selection
let selectedVoiceIdentifier: string | undefined = undefined;
let isVoiceInitialized = false;

export async function initVoice() {
  if (isVoiceInitialized) return;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    
    // Filter English voices
    const englishVoices = voices.filter(
      (v) => v.language.startsWith("en-") || v.language === "en"
    );

    if (englishVoices.length > 0) {
      // 1. Look for Enhanced quality voice (available on iOS and some Android devices)
      const enhancedVoice = englishVoices.find(
        (v) =>
          v.quality === "enhanced" ||
          v.name.toLowerCase().includes("enhanced") ||
          v.name.toLowerCase().includes("premium")
      );

      if (enhancedVoice) {
        selectedVoiceIdentifier = enhancedVoice.identifier;
        console.log(`[VoiceHelper] Selected enhanced voice: ${enhancedVoice.name}`);
      } else {
        // 2. Look for preferred providers (Siri, Google) which sound much better than basic default TTS
        const preferredVoice = englishVoices.find(
          (v) =>
            v.name.toLowerCase().includes("google") ||
            v.name.toLowerCase().includes("siri")
        );
        selectedVoiceIdentifier = preferredVoice?.identifier || englishVoices[0].identifier;
        console.log(`[VoiceHelper] Selected preferred voice: ${preferredVoice?.name || englishVoices[0].name}`);
      }
    }
    isVoiceInitialized = true;
  } catch (err) {
    console.warn("[VoiceHelper] Error querying voices, using system default.", err);
  }
}

// Pre-initialize voice options
initVoice();

export function useVoiceSettings() {
  const [isMuted, setIsMuted] = useState(globalMuted);

  useEffect(() => {
    setIsMuted(globalMuted);
    const listener = (muted: boolean) => {
      setIsMuted(muted);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setMuted = async (muted: boolean) => {
    globalMuted = muted;
    listeners.forEach((l) => l(muted));
    try {
      await SecureStore.setItemAsync(SECURE_STORE_KEY, muted ? "true" : "false");
    } catch (err) {
      console.error("Failed to save voice muted setting", err);
    }
  };

  return { isMuted, setMuted };
}

export function isVoiceMuted() {
  return globalMuted;
}

export async function speakHumanLike(text: string) {
  if (globalMuted) return;

  // Make sure we stop any active speaking first to avoid overlapping robotic voices
  Speech.stop();

  if (!isVoiceInitialized) {
    await initVoice();
  }

  // Speak with more natural cadence (rate: ~0.95, pitch: ~1.0) using the selected human-like voice
  Speech.speak(text, {
    voice: selectedVoiceIdentifier,
    rate: 0.92, // Slightly slower rate sounds less mechanical
    pitch: 1.0, // Natural pitch
  });
}
