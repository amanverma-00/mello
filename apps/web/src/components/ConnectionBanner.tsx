import { useEffect, useState } from "react";

interface ConnectionBannerProps {
  connected: boolean;
}

export function ConnectionBanner({ connected }: ConnectionBannerProps) {
  const [show, setShow] = useState(false);
  const [reconnectFailed, setReconnectFailed] = useState(false);

  useEffect(() => {
    if (!connected) {
      // Show "Reconnecting..." after 1s of disconnection
      const timer = setTimeout(() => setShow(true), 1000);
      // "Connection lost" after 30s
      const failTimer = setTimeout(() => setReconnectFailed(true), 30_000);
      return () => {
        clearTimeout(timer);
        clearTimeout(failTimer);
      };
    }
    // Connected — dismiss
    setShow(false);
    setReconnectFailed(false);
  }, [connected]);

  if (!show) return null;

  return (
    <div
      className={`connection-banner ${reconnectFailed ? "banner-error" : "banner-warning"}`}
      role="alert"
    >
      <span>
        {reconnectFailed
          ? "Connection lost."
          : "Reconnecting..."}
      </span>
      {reconnectFailed && (
        <button
          className="btn-retry"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      )}
    </div>
  );
}
