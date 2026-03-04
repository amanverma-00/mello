import { useState } from "react";

interface QueueItemData {
  spotifyTrackId: string;
  title: string;
  artist: string;
  albumArt: string;
  durationMs: number;
  votes: number;
  addedBy: string;
  addedAt: string;
}

interface QueueListProps {
  queue: QueueItemData[];
  userVotes: Set<string>;
  code: string;
  token: string;
  role: "host" | "participant";
  onVoteToggled: () => void;
}

export function QueueList({
  queue,
  userVotes,
  code,
  token,
  role,
  onVoteToggled,
}: QueueListProps) {
  const [votingTrack, setVotingTrack] = useState<string | null>(null);

  const handleVote = async (spotifyTrackId: string) => {
    setVotingTrack(spotifyTrackId);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (role === "host") {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        headers["x-participant-token"] = token;
      }

      await fetch(`/api/v1/sessions/${code}/vote`, {
        method: "POST",
        headers,
        body: JSON.stringify({ spotifyTrackId }),
      });

      onVoteToggled();
    } catch {
      // silently fail — queue:updated event will reconcile
    } finally {
      setVotingTrack(null);
    }
  };

  const formatDuration = (ms: number): string => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (queue.length === 0) {
    return (
      <div className="queue-empty" role="status">
        <p>No songs yet — be the first to add one!</p>
      </div>
    );
  }

  return (
    <div className="queue-list" role="list" aria-label="Song queue">
      {queue.map((item, index) => {
        const hasVoted = userVotes.has(item.spotifyTrackId);
        return (
          <div key={item.spotifyTrackId} className="queue-item" role="listitem">
            <span className="queue-rank">{index + 1}</span>
            <img
              src={item.albumArt}
              alt=""
              className="queue-album-art"
            />
            <div className="queue-track-info">
              <span className="queue-title">{item.title}</span>
              <span className="queue-artist">
                {item.artist} &middot; {formatDuration(item.durationMs)}
              </span>
            </div>
            <button
              className={`btn-vote ${hasVoted ? "voted" : ""}`}
              onClick={() => handleVote(item.spotifyTrackId)}
              disabled={votingTrack === item.spotifyTrackId}
              aria-label={`${hasVoted ? "Remove vote from" : "Vote for"} ${item.title} — ${item.votes} vote${item.votes !== 1 ? "s" : ""}`}
              aria-pressed={hasVoted}
            >
              <span className="vote-icon" aria-hidden="true">{hasVoted ? "▲" : "△"}</span>
              <span className="vote-count">{item.votes}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
