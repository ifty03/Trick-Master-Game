import { useEffect, useRef } from "react";
import { getSocket, joinLobby, joinRoomChannel, leaveRoomChannel } from "@/lib/socket";
import { useAuthContext } from "@/context/AuthContext";

type Handlers = {
  onLobbyUpdate?: () => void;
  onRoomUpdate?: (payload: unknown) => void;
  onRoomPlayers?: (players: unknown) => void;
  onGameState?: (gameState: unknown) => void;
};

export function useGameSocket(
  scope: "lobby" | "room" | "game",
  roomId: string | undefined,
  handlers: Handlers
) {
  const { isSocketReady } = useAuthContext();
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!isSocketReady) return;

    const socket = getSocket();

    if (scope === "lobby") {
      joinLobby();
      const onLobby = () => handlersRef.current.onLobbyUpdate?.();
      socket.on("lobby:updated", onLobby);

      const handleConnect = () => {
        console.log("[useGameSocket] Lobby socket connected/reconnected, re-joining lobby");
        joinLobby();
      };
      socket.on("connect", handleConnect);

      return () => {
        socket.off("lobby:updated", onLobby);
        socket.off("connect", handleConnect);
      };
    }

    if (!roomId) return;

    joinRoomChannel(roomId);

    const onRoom = (payload: unknown) => handlersRef.current.onRoomUpdate?.(payload);
    const onPlayers = (players: unknown) => handlersRef.current.onRoomPlayers?.(players);
    const onGame = (gameState: unknown) => handlersRef.current.onGameState?.(gameState);

    socket.on("room:updated", onRoom);
    socket.on("room:players", onPlayers);
    socket.on("game:state", onGame);

    const handleConnect = () => {
      console.log(`[useGameSocket] Room socket connected/reconnected, re-joining room: ${roomId}`);
      joinRoomChannel(roomId);
    };
    socket.on("connect", handleConnect);

    return () => {
      socket.off("room:updated", onRoom);
      socket.off("room:players", onPlayers);
      socket.off("game:state", onGame);
      socket.off("connect", handleConnect);
      leaveRoomChannel(roomId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, roomId, isSocketReady]);
}

