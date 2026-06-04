import { useEffect, useRef } from "react";
import { speakHumanLike } from "@/lib/voiceHelper";
import type { Room, RoomPlayer } from "@/types/game";

export function useRoomVoice(room: Room | null, players: RoomPlayer[], myUserId: string) {
  const prevPlayers = useRef<RoomPlayer[]>([]);
  const prevStatus = useRef<string | null>(null);

  useEffect(() => {
    if (!room) {
      prevPlayers.current = [];
      prevStatus.current = null;
      return;
    }

    const prev = prevPlayers.current;
    prevPlayers.current = players;

    const prevStat = prevStatus.current;
    prevStatus.current = room.status;

    if (prev.length === 0) return; // Skip first load

    // 1. Detect if a player joined
    if (players.length > prev.length) {
      const joined = players.find((p) => !prev.some((pp) => pp.clerk_user_id === p.clerk_user_id));
      if (joined && joined.clerk_user_id !== myUserId) {
        speakHumanLike(`${joined.username} joined the room.`);
      }
    }

    // 2. Detect if a player left
    if (players.length < prev.length) {
      const left = prev.find((p) => !players.some((pp) => pp.clerk_user_id === p.clerk_user_id));
      if (left && left.clerk_user_id !== myUserId) {
        speakHumanLike(`${left.username} left the room.`);
      }
    }

    // 3. Detect if status changed to playing
    if (prevStat === "waiting" && room.status === "playing") {
      speakHumanLike("The game is starting!");
    }
  }, [room, players, myUserId]);
}
