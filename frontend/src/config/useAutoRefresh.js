import { useEffect, useRef } from "react";

// Keeps admin lists current with changes made elsewhere (e.g. a team editing its details in the Team Portal):
// refreshes every `intervalMs` while the tab is visible, and right away when the tab regains focus.
// `refresh` is called with { silent: true } so pages can update without flashing a loading state.
// While `paused` (an edit form or dialog is open), nothing refreshes, so unsaved admin input is never replaced.
export const ADMIN_REFRESH_MS = 30_000;

export default function useAutoRefresh(refresh, { paused = false, intervalMs = ADMIN_REFRESH_MS } = {}) {
  const refreshRef = useRef(refresh);
  const pausedRef = useRef(paused);
  useEffect(() => { refreshRef.current = refresh; pausedRef.current = paused; });

  useEffect(() => {
    const run = () => { if (!pausedRef.current && document.visibilityState === "visible") refreshRef.current({ silent: true }); };
    const timer = setInterval(run, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
}
