"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CONTROLS_STORAGE_KEY,
  DEFAULT_CONTROLS,
  parseControls,
  type ControlsPrefs,
} from "@/app/lib/controls";

interface ControlsContextValue {
  controls: ControlsPrefs;
  updateControls: (partial: Partial<ControlsPrefs>) => void;
  resetControls: () => void;
}

const ControlsContext = createContext<ControlsContextValue | null>(null);

function readLocal(): ControlsPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_CONTROLS };
  try {
    const raw = window.localStorage.getItem(CONTROLS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONTROLS };
    return parseControls(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONTROLS };
  }
}

function writeLocal(prefs: ControlsPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore.
  }
}

interface ControlsProviderProps {
  authLevel?: "anonymous" | "google";
  children: ReactNode;
}

export function ControlsProvider({ authLevel, children }: ControlsProviderProps) {
  const [controls, setControls] = useState<ControlsPrefs>(() => DEFAULT_CONTROLS);
  // Tracks whether the user has issued any updateControls call since mount.
  // Used to suppress an in-flight initial GET response from clobbering a fresh edit.
  const hasUserEditedRef = useRef(false);

  // Hydrate from localStorage once on client mount.
  // Wrapped in Promise.resolve().then() to satisfy react-hooks/set-state-in-effect
  // (setState must not be called synchronously in an effect body).
  useEffect(() => {
    Promise.resolve(readLocal()).then(local => setControls(local));
  }, []);

  // For google-authenticated users, sync with the server.
  useEffect(() => {
    if (authLevel !== "google") return;
    let cancelled = false;

    (async () => {
      let res: Response;
      try {
        res = await fetch("/api/preferences/controls", { cache: "no-store" });
      } catch (err) {
        console.warn("[controls] GET failed:", err);
        return;
      }
      if (cancelled) return;

      if (res.status === 404) {
        // First-sign-in merge: push current local prefs to the server.
        const local = readLocal();
        try {
          await fetch("/api/preferences/controls", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ controls: local }),
          });
        } catch (err) {
          console.warn("[controls] first-sign-in PUT failed:", err);
        }
        return;
      }

      if (!res.ok) return;

      // Race guard: if the user has clicked something since mount, don't overwrite.
      if (hasUserEditedRef.current) return;

      const body = await res.json().catch(() => null);
      if (!body || cancelled) return;
      const remote = parseControls(body.controls);
      setControls(remote);
      writeLocal(remote);
    })();

    return () => { cancelled = true; };
  }, [authLevel]);

  const updateControls = useCallback((partial: Partial<ControlsPrefs>) => {
    hasUserEditedRef.current = true;
    setControls(prev => {
      const next = parseControls({ ...prev, ...partial });
      writeLocal(next);
      if (authLevel === "google") {
        fetch("/api/preferences/controls", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ controls: next }),
        }).catch(err => console.warn("[controls] PUT failed:", err));
      }
      return next;
    });
  }, [authLevel]);

  const resetControls = useCallback(() => {
    updateControls(DEFAULT_CONTROLS);
  }, [updateControls]);

  return (
    <ControlsContext.Provider value={{ controls, updateControls, resetControls }}>
      {children}
    </ControlsContext.Provider>
  );
}

export function useControls(): ControlsContextValue {
  const ctx = useContext(ControlsContext);
  if (!ctx) throw new Error("useControls must be called inside <ControlsProvider>");
  return ctx;
}
