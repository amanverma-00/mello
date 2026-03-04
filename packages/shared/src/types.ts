import { z } from "zod";
import {
  createSessionResponseSchema,
  joinSessionRequestSchema,
  joinSessionResponseSchema,
  addSongRequestSchema,
  queueItemSchema,
  voteRequestSchema,
  searchResultItemSchema,
  nowPlayingSchema,
  apiErrorSchema,
} from "./schemas.js";

// Inferred TypeScript types from Zod schemas

export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;
export type JoinSessionRequest = z.infer<typeof joinSessionRequestSchema>;
export type JoinSessionResponse = z.infer<typeof joinSessionResponseSchema>;
export type AddSongRequest = z.infer<typeof addSongRequestSchema>;
export type QueueItem = z.infer<typeof queueItemSchema>;
export type VoteRequest = z.infer<typeof voteRequestSchema>;
export type SearchResultItem = z.infer<typeof searchResultItemSchema>;
export type NowPlaying = z.infer<typeof nowPlayingSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
