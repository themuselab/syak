// Analytics 어댑터 — events 테이블에 적재 (Supabase, anon insert). 실패 silent.
import type { AnalyticsSink } from "../ports/analytics-sink";
import type { AnalyticsEvent } from "../domain/event";
import { SUPABASE_URL, SUPABASE_ANON } from "../../../shared/platform/supabase";
import { clientId, device } from "../../../shared/platform/visitor";

function sessionId(): string {
  const w = window as unknown as { __syak_sid?: string };
  if (!w.__syak_sid) w.__syak_sid = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return w.__syak_sid;
}

export class SupabaseAnalyticsSink implements AnalyticsSink {
  constructor(private readonly platform: "toss" | "web" = "toss") {}

  send(event: AnalyticsEvent): void {
    try {
      fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          session_id: sessionId(),
          event: event.event,
          shop_id: event.shopId ?? null,
          shop_category: event.shopCategory ?? null,
          shop_district: event.shopDistrict ?? null,
          route: event.route ?? null,
          entry: event.entry ?? null,
          source: event.source ?? null,
          ms: event.ms ?? null,
          slot_date: event.slotDate ?? null,
          slot_time: event.slotTime ?? null,
          ts: Date.now(),
          platform: this.platform,
          device, // pc | ios | android
          client_id: clientId, // 영속 방문자 id (순방문자·리텐션)
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // silent
    }
  }
}
