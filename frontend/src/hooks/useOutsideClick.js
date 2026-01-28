// frontend/src/hooks/useOutsideClick.js
import { useEffect } from "react";

/**
 * useOutsideClick
 * Calls `handler` when a click/touch happens outside of `ref.current`.
 *
 * @param {React.RefObject<HTMLElement>} ref
 * @param {(event: Event) => void} handler
 * @param {boolean} enabled
 */
export function useOutsideClick(ref, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const listener = (event) => {
      const el = ref?.current;
      if (!el) return;
      // Ignore clicks on the element or its descendants.
      if (el.contains(event.target)) return;
      handler?.(event);
    };

    // Capture phase so we reliably catch even if inner elements stopPropagation.
    document.addEventListener("mousedown", listener, true);
    document.addEventListener("touchstart", listener, true);

    return () => {
      document.removeEventListener("mousedown", listener, true);
      document.removeEventListener("touchstart", listener, true);
    };
  }, [ref, handler, enabled]);
}
