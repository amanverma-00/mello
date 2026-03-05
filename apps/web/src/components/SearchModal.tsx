import { useState, useEffect, useRef } from "react";
import { useToast } from "./Toast";

interface SearchResult {
  spotifyTrackId: string;
  title: string;
  artist: string;
  albumArt: string;
  durationMs: number;
}

interface SearchModalProps {
  code: string;
  token: string;
  role: "host" | "participant";
  onClose: () => void;
  onAdded: () => void;
}

export function SearchModal({
  code,
  token,
  role,
  onClose,
  onAdded,
}: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const headers: Record<string, string> = {};
        if (role === "host") {
          headers["Authorization"] = `Bearer ${token}`;
        } else {
          headers["x-participant-token"] = token;
        }

        const res = await fetch(
          `${import.meta.env.VITE_API_URL ?? ""}/api/v1/sessions/${code}/search?q=${encodeURIComponent(trimmed)}`,
          { headers },
        );
        if (res.ok) {
          const data = (await res.json()) as SearchResult[];
          setResults(data);
        }
      } catch {
        // silently fail
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, code, token, role]);

  const handleAdd = async (track: SearchResult) => {
    setAdding(track.spotifyTrackId);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (role === "host") {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        headers["x-participant-token"] = token;
      }

      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/sessions/${code}/queue`, {
        method: "POST",
        headers,
        body: JSON.stringify({ spotifyTrackId: track.spotifyTrackId }),
      });

      if (res.status === 409) {
        toast.show("Already in queue — upvote it instead!", "warning");
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.show(
          (body as { error?: { message?: string } }).error?.message ??
            "Failed to add song",
          "error",
        );
        return;
      }

      toast.show(`Added "${track.title}"`, "success");
      onAdded();
      onClose();
    } catch {
      toast.show("Failed to add song", "error");
    } finally {
      setAdding(null);
    }
  };

  const formatDuration = (ms: number): string => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add a Song</h2>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search for a song..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search for a song"
        />

        <div className="search-results">
          {searching && <p className="search-status">Searching...</p>}

          {!searching && query.trim() && results.length === 0 && (
            <p className="search-status">No results found</p>
          )}

          {results.map((track) => (
            <div key={track.spotifyTrackId} className="search-result-item">
              <img
                src={track.albumArt}
                alt=""
                className="result-album-art"
              />
              <div className="result-info">
                <span className="result-title">{track.title}</span>
                <span className="result-artist">
                  {track.artist} &middot; {formatDuration(track.durationMs)}
                </span>
              </div>
              <button
                className="btn btn-add"
                disabled={adding === track.spotifyTrackId}
                onClick={() => handleAdd(track)}
                aria-label={`Add ${track.title} by ${track.artist} to queue`}
              >
                {adding === track.spotifyTrackId ? "..." : "+"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
