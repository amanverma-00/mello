import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@melo/shared";

type MeloSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface UseSocketOptions {
  sessionCode: string;
  token: string;
}

export function useSocket({ sessionCode, token }: UseSocketOptions) {
  const socketRef = useRef<MeloSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    const socket: MeloSocket = io(import.meta.env.VITE_API_URL ?? "", {
      auth: { sessionCode, token },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("participant:joined", ({ count }) => {
      setParticipantCount(count);
    });

    socket.on("participant:left", ({ count }) => {
      setParticipantCount(count);
    });

    socket.on("session:ended", () => {
      setSessionEnded(true);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionCode, token]);

  return {
    socket: socketRef.current,
    connected,
    participantCount,
    sessionEnded,
    setParticipantCount,
  };
}
