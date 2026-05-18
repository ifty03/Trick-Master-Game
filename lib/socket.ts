import { io, type Socket } from "socket.io-client";
import { getApiUrl } from "./api";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(getApiUrl(), {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinLobby() {
  getSocket().emit("join:lobby");
}

export function joinRoomChannel(roomId: string) {
  getSocket().emit("join:room", roomId);
}

export function leaveRoomChannel(roomId: string) {
  getSocket().emit("leave:room", roomId);
}
