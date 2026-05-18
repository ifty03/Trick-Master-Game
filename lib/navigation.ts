import type { Router } from "expo-router";
import { apiFetch } from "./api";

export async function navigateToGameWhenReady(
  roomId: string,
  router: Router
): Promise<boolean> {
  try {
    const data = await apiFetch<{ game_state: unknown | null }>(`/game/${roomId}`);
    if (data.game_state) {
      router.replace(`/(home)/game/${roomId}`);
      return true;
    }
    return false;
  } catch (e) {
    console.error("navigateToGameWhenReady error:", e);
    return false;
  }
}
