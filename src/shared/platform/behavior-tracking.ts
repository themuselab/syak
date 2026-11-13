type Properties = Record<string, string | number | boolean>;
type Clarity = ((...args: unknown[]) => void) & { q?: unknown[][] };
type Browser = Window & { clarity?: Clarity };
const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });

export function createBehaviorTracking(
  endpoint: string,
  clarityProjectId?: string,
) {
  let session: { id: string; at: number } | undefined;
  let booted = false;
  let inFlight = 0;
  function clarity() {
    if (
      !clarityProjectId ||
      !/^[a-z0-9]{5,30}$/i.test(clarityProjectId) ||
      typeof window === "undefined"
    )
      return;
    const w = window as Browser;
    if (!booted) {
      booted = true;
      if (!w.clarity) {
        const fn: Clarity = (...args) => {
          (fn.q ??= []).push(args);
        };
        w.clarity = fn;
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.clarity.ms/tag/${clarityProjectId}`;
        script.dataset.syakClarity = "true";
        document.head.appendChild(script);
      }
      // Cookie-free by default. A consent manager can explicitly grant storage later.
      w.clarity("consentv2", {
        analytics_Storage: "denied",
        ad_Storage: "denied",
      });
    }
    return w.clarity;
  }
  return (eventName: string, params: Properties) => {
    if (typeof window === "undefined") return;
    // Development and preview traffic must not enter the production analytics project.
    const hostname = window.location?.hostname;
    if (hostname && !['themuselab.kr', 'www.themuselab.kr', 'app.themuselab.kr'].includes(hostname)) return;
    const now = Date.now();
    if (!session) {
      try {
        const saved = JSON.parse(
          sessionStorage.getItem("syak:behavior-session") ?? "null",
        );
        if (saved?.id && Number.isFinite(saved.at)) session = saved;
      } catch {
        /* storage optional */
      }
    }
    const fresh = !session || now - session.at > 30 * 60 * 1000;
    if (fresh) session = { id: uuid(), at: now };
    const current = session!;
    current.at = now;
    try {
      sessionStorage.setItem("syak:behavior-session", JSON.stringify(current));
    } catch {
      /* storage optional */
    }
    const platform = String(params.platform ?? "web");
    const make = (name: string, ts: number) => ({
      event_id: uuid(),
      session_id: current.id,
      event_name: name,
      ts,
      platform,
      shop_id: params.shop_id,
      shop_type: params.shop_type,
      reservation_method: params.reservation_method ?? params.route,
    });
    const events = fresh ? [make("service_enter", now - 1)] : [];
    if (eventName !== "service_enter") events.push(make(eventName, now));
    if (events.length && inFlight < 8) {
      inFlight++;
      void fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
        keepalive: true,
        credentials: "omit",
      })
        .catch(() => {})
        .finally(() => {
          inFlight--;
        });
    }
    const c = clarity();
    if (c) {
      c("set", "platform", platform);
      if (params.shop_type) c("set", "shop_type", String(params.shop_type));
      if (params.shop_id) c("set", "shop_id", String(params.shop_id));
      if (
        [
          "shop_view",
          "reserve_click",
          "service_enter",
          "search_submit",
          "filter_apply",
          "slot_alert_created",
        ].includes(eventName)
      )
        c("event", eventName);
    }
  };
}
