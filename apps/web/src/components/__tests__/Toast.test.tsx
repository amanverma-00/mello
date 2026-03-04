import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "../Toast";

function TestTrigger() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.show("Test info")}>Info</button>
      <button onClick={() => toast.show("Test error", "error")}>Error</button>
      <button onClick={() => toast.show("Test success", "success")}>Success</button>
      <button onClick={() => toast.show("Test warning", "warning")}>Warning</button>
    </div>
  );
}

describe("Toast", () => {
  it("renders a toast when show is called", () => {
    render(
      <ToastProvider>
        <TestTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Info"));
    expect(screen.getByText("Test info")).toBeInTheDocument();
  });

  it("renders toasts with correct CSS class by type", () => {
    render(
      <ToastProvider>
        <TestTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Error"));
    const toastEl = screen.getByText("Test error");
    expect(toastEl).toHaveClass("toast-error");
  });

  it("can show multiple toasts", () => {
    render(
      <ToastProvider>
        <TestTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Info"));
    fireEvent.click(screen.getByText("Warning"));
    expect(screen.getByText("Test info")).toBeInTheDocument();
    expect(screen.getByText("Test warning")).toBeInTheDocument();
  });

  it("dismisses a toast when clicked", () => {
    render(
      <ToastProvider>
        <TestTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Info"));
    const toast = screen.getByText("Test info");
    expect(toast).toBeInTheDocument();

    fireEvent.click(toast);
    expect(screen.queryByText("Test info")).not.toBeInTheDocument();
  });

  it("auto-dismisses after 4 seconds", async () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <TestTrigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Info"));
    expect(screen.getByText("Test info")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4100);
    });

    expect(screen.queryByText("Test info")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("throws when useToast is used outside provider", () => {
    function Broken() {
      useToast();
      return null;
    }

    // Suppress console.error during expected throw
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Broken />)).toThrow(
      "useToast must be used within ToastProvider",
    );
    spy.mockRestore();
  });

  it("has the correct aria attributes on the container", () => {
    render(
      <ToastProvider>
        <div>child</div>
      </ToastProvider>,
    );

    const container = document.querySelector(".toast-container");
    expect(container).toHaveAttribute("role", "status");
    expect(container).toHaveAttribute("aria-live", "polite");
  });
});
