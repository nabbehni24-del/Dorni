"use client";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";

// Events invalidate the view; the API rechecks current permissions on every fetch.
export function useSupportLive(refresh: () => void, enabled = true) {
  const callback = useRef(refresh);
  useEffect(() => { callback.current = refresh; }, [refresh]);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let debounce: ReturnType<typeof setTimeout>;
    const update = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(debounce);
      debounce = setTimeout(() => callback.current(), 200);
    };
    let dispose = () => {};
    try {
      const supabase = createBrowserSupabase();
      const channel = supabase.channel(`support-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_tickets" }, update)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets" }, update)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, update)
        .subscribe(status => { setConnected(status === "SUBSCRIBED"); if (status === "SUBSCRIBED") update(); });
      dispose = () => { void supabase.removeChannel(channel); };
    } catch { /* Periodic refresh remains available. */ }
    const timer = setInterval(update, 15000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    return () => { dispose(); clearInterval(timer); clearTimeout(debounce); document.removeEventListener("visibilitychange", update); window.removeEventListener("online", update); };
  }, [enabled]);
  return enabled && connected;
}
