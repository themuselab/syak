export type EventProperties = Record<string, string | number | boolean>;
type Options = { sdkKey?: string; gtmId?: string; transport?: string; deviceId?: string; getDeviceId?: () => Promise<string>; onEvent?: (name: string, properties: EventProperties) => void };
type BrowserWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

/** One delivery owner per destination. GTM must not resend direct GA events. */
export function createAnalyticsDelivery(options: Options) {
  let userId: string | undefined;
  let deviceId = options.deviceId;
  let pending = 0;
  let sdk: Promise<import('@hackler/javascript-sdk').HackleClient | undefined> | undefined;
  const gtm = options.transport === 'gtm' && /^GTM-[A-Z0-9]+$/.test(options.gtmId ?? '');
  function initialize() {
    if (typeof window === 'undefined' || !options.sdkKey) return;
    sdk ??= (async () => {
      if (!deviceId && options.getDeviceId) deviceId = await options.getDeviceId();
      const { createInstance } = await import('@hackler/javascript-sdk');
      const client = createInstance(options.sdkKey!, {
        automaticPageTracking: false, automaticRouteTracking: false,
        pollingIntervalMillis: 60000,
        ...(deviceId ? { user: { deviceId } } : {}),
      });
      await client.onInitialized();
      return client;
    })().catch(() => undefined);
    return sdk;
  }
  return {
    async decideNaverCta(signal: AbortSignal) {
      const currentUserId = userId;
      if (signal.aborted) return undefined;
      const client = await initialize();
      if (!client || !deviceId || signal.aborted) return undefined;
      const user = { deviceId, ...(currentUserId ? { userId: currentUserId } : {}) };
      try {
        if (!client.isFeatureOn(4, user)) return undefined;
        const decision = client.variationDetail(5, user);
        if (!['TRAFFIC_ALLOCATED', 'OVERRIDDEN'].includes(decision.reason)) return undefined;
        const variation = decision.variation;
        if (variation !== 'A' && variation !== 'B') return undefined;
        const label = client.remoteConfig(user).get('syak_naver_cta_label', '네이버에서 확인하기');
        return { variation, label: typeof label === 'string' && label.trim().length > 0 && label.length <= 24 ? label : '네이버에서 확인하기' };
      } catch { return undefined; }
    },
    setIdentity(id: string | null, anonymous?: string) { userId = id ?? undefined; if (anonymous) deviceId = anonymous; },
    send(name: string, properties: EventProperties) {
      if (typeof window === 'undefined') return;
      const w = window as BrowserWindow;
      const params: EventProperties = {
        ...properties, schema_version: 2,
        page_path: window.location.pathname,
        event_id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
      // Search input, URLs with queries, credentials and error messages are never forwarded.
      for (const key of ['search_term', 'phone', 'email', 'name', 'token', 'url', 'error_message']) delete params[key];
      try { options.onEvent?.(name, params); } catch { /* independent destination */ }
      w.dataLayer ??= [];
      if (gtm && !document.querySelector('script[data-syak-gtm]')) {
        w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
        const script = document.createElement('script');
        script.async = true;
        script.dataset.syakGtm = 'true';
        script.src = `https://www.googletagmanager.com/gtm.js?id=${options.gtmId}`;
        document.head.appendChild(script);
      }
      w.dataLayer.push({ event_params: null });
      w.dataLayer.push({ event: 'syak_event', event_name: name, analytics_transport: gtm ? 'gtm' : 'direct', event_params: params });
      if (!gtm) {
        try { w.gtag?.('event', name, params); } catch { /* independent destination */ }
      }
      const ready = initialize();
      if (ready && pending < 128) {
        pending++;
        const identity = { ...(deviceId ? { deviceId } : {}), ...(userId ? { userId } : {}) };
        void ready.then(client => client?.track({ key: name, properties: params }, { ...(deviceId ? { deviceId } : {}), ...identity })).catch(() => {}).finally(() => { pending--; });
      }
    },
  };
}

/** Generic interaction coverage without recording text, form values or destination URLs. */
export function installInteractionTracking(send: (name: string, params: EventProperties) => void) {
  if (typeof window === 'undefined') return () => {};
  const selector = 'button,a,[role="button"],[role="tab"],[role="switch"]';
  const click = (event: MouseEvent) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const control = event.target.closest(selector);
    if (!control) return;
    const role = control.getAttribute('role') ?? control.tagName.toLowerCase();
    const controls = Array.from(document.querySelectorAll(selector));
    const controlId = control.getAttribute('data-analytics') ?? `${role}:${controls.indexOf(control)}`;
    send('ui_interaction', { action: controlId, element_type: role });
  };
  let depths = new WeakMap<Element, Set<number>>();
  let scrollPath = window.location.pathname;
  const scroll = (event: Event) => {
    if (scrollPath !== window.location.pathname) { scrollPath = window.location.pathname; depths = new WeakMap(); }
    const target = event.target === document ? document.scrollingElement : event.target;
    if (!(target instanceof Element)) return;
    const height = target.scrollHeight - target.clientHeight;
    if (height <= 0) return;
    const percent = target.scrollTop / height * 100;
    const seen = depths.get(target) ?? new Set<number>();
    for (const depth of [25, 50, 75, 90]) if (percent >= depth && !seen.has(depth)) {
      seen.add(depth); send('scroll_depth', { depth, element_type: target.tagName.toLowerCase() });
    }
    depths.set(target, seen);
  };
  const runtimeError = () => send('client_error', { error_code: 'runtime_error' });
  const rejection = () => send('client_error', { error_code: 'unhandled_rejection' });
  document.addEventListener('click', click, true);
  document.addEventListener('scroll', scroll, { capture: true, passive: true });
  window.addEventListener('error', runtimeError);
  window.addEventListener('unhandledrejection', rejection);
  return () => {
    document.removeEventListener('click', click, true);
    document.removeEventListener('scroll', scroll, true);
    window.removeEventListener('error', runtimeError);
    window.removeEventListener('unhandledrejection', rejection);
  };
}
