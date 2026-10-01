"use client";

import { useEffect, useRef, useCallback } from "react";
import { signOut } from "./api";

export interface IdleTimeoutOptions {
  /** Inactivity timeout in milliseconds (default: 15 minutes = 900,000 ms) */
  timeoutMs?: number;
  /** Warning timeout before logout in milliseconds (default: 13 minutes = 780,000 ms) */
  warningMs?: number;
  /** Optional callback fired when warning threshold is reached */
  onWarning?: () => void;
  /** Optional callback fired right before logout occurs */
  onTimeout?: () => void;
  /** Redirect URL after sign out (default: "/login?reason=timeout") */
  redirectUrl?: string;
}

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_WARNING_MS = 13 * 60 * 1000; // 13 minutes warning

/**
 * SJ Consulting — Candidate & Admin Session Inactivity Listener
 *
 * Enforces strict 15-minute idle session termination without needing
 * custom Express cookie middleware or abandoning Supabase.
 *
 * Usage in Next.js layout or root provider:
 *
 *   useIdleTimeout({
 *     onWarning: () => toast.warn("You will be logged out in 2 minutes due to inactivity."),
 *   });
 */
export function useIdleTimeout(options: IdleTimeoutOptions = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    warningMs = DEFAULT_WARNING_MS,
    onWarning,
    onTimeout,
    redirectUrl = "/login?reason=timeout",
  } = options;

  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = useCallback(async () => {
    try {
      if (onTimeout) onTimeout();
      await signOut();
    } catch (err) {
      console.error("Auto-logout error:", err);
    } finally {
      if (typeof window !== "undefined") {
        window.location.href = redirectUrl;
      }
    }
  }, [onTimeout, redirectUrl]);

  const resetTimers = useCallback(() => {
    // Clear existing timers
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);

    // Set warning timer
    if (onWarning && warningMs < timeoutMs) {
      warningTimerRef.current = setTimeout(() => {
        onWarning();
      }, warningMs);
    }

    // Set hard logout timer
    logoutTimerRef.current = setTimeout(() => {
      handleLogout();
    }, timeoutMs);
  }, [handleLogout, onWarning, timeoutMs, warningMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Events indicating user presence
    const activityEvents = [
      "mousedown",
      "mousemove",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];

    // Throttle event listeners to avoid excessive timer resets
    let lastActivity = Date.now();
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivity > 1000) {
        lastActivity = now;
        resetTimers();
      }
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    // Initialize timers on mount
    resetTimers();

    return () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
    };
  }, [resetTimers]);
}
