import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NowPlayingBar, type NowPlayingState } from "../NowPlaying";

const mockNowPlaying: NowPlayingState = {
  spotifyTrackId: "track_1",
  title: "Test Track",
  artist: "Test Artist",
  albumArt: "https://img.example.com/art.jpg",
  startedAt: new Date().toISOString(),
  durationMs: 210000,
  isPaused: false,
  progressMs: 0,
};

describe("NowPlayingBar", () => {
  it("renders nothing when nowPlaying is null", () => {
    const { container } = render(
      <NowPlayingBar
        nowPlaying={null}
        role="participant"
        code="ABC123"
        token="p_test"
      />,
    );
    expect(container.querySelector(".now-playing-bar")).toBeNull();
  });

  it("renders track info when playing", () => {
    render(
      <NowPlayingBar
        nowPlaying={mockNowPlaying}
        role="participant"
        code="ABC123"
        token="p_test"
      />,
    );

    expect(screen.getByText("Test Track")).toBeInTheDocument();
    expect(screen.getByText("Test Artist")).toBeInTheDocument();
  });

  it("shows album art with correct alt text", () => {
    render(
      <NowPlayingBar
        nowPlaying={mockNowPlaying}
        role="participant"
        code="ABC123"
        token="p_test"
      />,
    );

    const img = screen.getByAltText("Test Track");
    expect(img).toHaveAttribute("src", "https://img.example.com/art.jpg");
  });

  it("does NOT show playback controls for participants", () => {
    render(
      <NowPlayingBar
        nowPlaying={mockNowPlaying}
        role="participant"
        code="ABC123"
        token="p_test"
      />,
    );

    expect(screen.queryByTitle("Pause")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Skip")).not.toBeInTheDocument();
  });

  it("shows playback controls for host when playing", () => {
    render(
      <NowPlayingBar
        nowPlaying={mockNowPlaying}
        role="host"
        code="ABC123"
        token="host_token"
      />,
    );

    expect(screen.getByTitle("Pause")).toBeInTheDocument();
    expect(screen.getByTitle("Skip")).toBeInTheDocument();
  });

  it("shows play button (instead of pause) when paused", () => {
    render(
      <NowPlayingBar
        nowPlaying={{ ...mockNowPlaying, isPaused: true, progressMs: 30000 }}
        role="host"
        code="ABC123"
        token="host_token"
      />,
    );

    expect(screen.getByTitle("Resume")).toBeInTheDocument();
    expect(screen.queryByTitle("Pause")).not.toBeInTheDocument();
  });

  it("displays formatted duration", () => {
    render(
      <NowPlayingBar
        nowPlaying={mockNowPlaying}
        role="participant"
        code="ABC123"
        token="p_test"
      />,
    );

    // 210000ms = 3:30
    expect(screen.getByText(/3:30/)).toBeInTheDocument();
  });
});
