import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ConnectionBanner } from "../ConnectionBanner";

describe("ConnectionBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows nothing when connected", () => {
    const { container } = render(<ConnectionBanner connected={true} />);
    expect(container.querySelector(".connection-banner")).toBeNull();
  });

  it("shows nothing immediately on disconnect (1s delay)", () => {
    const { container } = render(<ConnectionBanner connected={false} />);
    expect(container.querySelector(".connection-banner")).toBeNull();
  });

  it("shows reconnecting banner after 1s of disconnect", () => {
    render(<ConnectionBanner connected={false} />);

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(screen.getByText("Reconnecting...")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("banner-warning");
  });

  it("shows connection lost banner after 30s", () => {
    render(<ConnectionBanner connected={false} />);

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(screen.getByText("Connection lost.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("banner-error");
  });

  it("shows retry button after 30s", () => {
    render(<ConnectionBanner connected={false} />);

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("dismisses banner when reconnected", () => {
    const { rerender, container } = render(<ConnectionBanner connected={false} />);

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(screen.getByText("Reconnecting...")).toBeInTheDocument();

    rerender(<ConnectionBanner connected={true} />);
    expect(container.querySelector(".connection-banner")).toBeNull();
  });
});
