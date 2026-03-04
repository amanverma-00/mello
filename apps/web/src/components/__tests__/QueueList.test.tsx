import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueueList } from "../QueueList";

const mockQueue = [
  {
    spotifyTrackId: "track_1",
    title: "Song One",
    artist: "Artist A",
    albumArt: "https://img.example.com/1.jpg",
    durationMs: 210000,
    votes: 5,
    addedBy: "p_user1",
    addedAt: "2025-01-01T00:00:00.000Z",
  },
  {
    spotifyTrackId: "track_2",
    title: "Song Two",
    artist: "Artist B",
    albumArt: "https://img.example.com/2.jpg",
    durationMs: 180000,
    votes: 3,
    addedBy: "p_user2",
    addedAt: "2025-01-01T00:01:00.000Z",
  },
];

describe("QueueList", () => {
  it("renders empty state when queue is empty", () => {
    render(
      <QueueList
        queue={[]}
        userVotes={new Set()}
        code="ABC123"
        token="p_test"
        role="participant"
        onVoteToggled={() => {}}
      />,
    );

    expect(
      screen.getByText("No songs yet — be the first to add one!"),
    ).toBeInTheDocument();
  });

  it("renders all queue items", () => {
    render(
      <QueueList
        queue={mockQueue}
        userVotes={new Set()}
        code="ABC123"
        token="p_test"
        role="participant"
        onVoteToggled={() => {}}
      />,
    );

    expect(screen.getByText("Song One")).toBeInTheDocument();
    expect(screen.getByText("Song Two")).toBeInTheDocument();
  });

  it("shows correct vote counts", () => {
    render(
      <QueueList
        queue={mockQueue}
        userVotes={new Set()}
        code="ABC123"
        token="p_test"
        role="participant"
        onVoteToggled={() => {}}
      />,
    );

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows filled vote icon for voted tracks", () => {
    render(
      <QueueList
        queue={mockQueue}
        userVotes={new Set(["track_1"])}
        code="ABC123"
        token="p_test"
        role="participant"
        onVoteToggled={() => {}}
      />,
    );

    const voteButtons = screen.getAllByRole("button");
    // track_1 should be voted, track_2 should not
    expect(voteButtons[0]).toHaveClass("voted");
    expect(voteButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(voteButtons[1]).not.toHaveClass("voted");
    expect(voteButtons[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onVoteToggled after clicking a vote button", async () => {
    const mockToggle = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    render(
      <QueueList
        queue={mockQueue}
        userVotes={new Set()}
        code="ABC123"
        token="p_test"
        role="participant"
        onVoteToggled={mockToggle}
      />,
    );

    const voteBtn = screen.getAllByRole("button")[0];
    fireEvent.click(voteBtn);

    // Wait for async vote call to resolve
    await vi.waitFor(() => expect(mockToggle).toHaveBeenCalled());
  });

  it("has proper ARIA attributes on the queue list", () => {
    render(
      <QueueList
        queue={mockQueue}
        userVotes={new Set()}
        code="ABC123"
        token="p_test"
        role="participant"
        onVoteToggled={() => {}}
      />,
    );

    expect(screen.getByRole("list")).toHaveAttribute(
      "aria-label",
      "Song queue",
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
  });

  it("formats duration correctly in artist line", () => {
    render(
      <QueueList
        queue={mockQueue}
        userVotes={new Set()}
        code="ABC123"
        token="p_test"
        role="participant"
        onVoteToggled={() => {}}
      />,
    );

    // 210000ms = 3:30, 180000ms = 3:00
    expect(screen.getByText(/Artist A.*3:30/)).toBeInTheDocument();
    expect(screen.getByText(/Artist B.*3:00/)).toBeInTheDocument();
  });

  it("displays rank numbers", () => {
    render(
      <QueueList
        queue={mockQueue}
        userVotes={new Set()}
        code="ABC123"
        token="p_test"
        role="participant"
        onVoteToggled={() => {}}
      />,
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
