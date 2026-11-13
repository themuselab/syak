type Properties = Record<string, string | number | boolean>;
type Clarity = ((...args: unknown[]) => void) & { q?: unknown[][] };
type Browser = Window & { clarity?: Clarity };
export function createClarityTracking(
  clarityProjectId?: string,
) {
  let booted = false;
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
    const platform = String(params.platform ?? "web");
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
