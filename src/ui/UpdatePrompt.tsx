import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Shows a slim banner when a new version of the PWA has been downloaded and
 * is waiting to activate. Tapping "Update" reloads the page so the new
 * service worker takes over and serves the fresh assets immediately.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="update-prompt">
      <span>New version available</span>
      <button type="button" onClick={() => updateServiceWorker(true)}>
        Update
      </button>
    </div>
  );
}
