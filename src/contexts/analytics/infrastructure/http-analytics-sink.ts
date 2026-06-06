// Analytics 어댑터 — themuselab.kr /api/track 로 POST. 외부 의존(fetch) 격리.
// 가게별 클릭 집계는 백엔드(Redis)에서 이뤄짐 — 여기선 raw 이벤트만 보냄.
import type { AnalyticsSink } from "../ports/analytics-sink";
import type { AnalyticsEvent } from "../domain/event";

const ENDPOINT = "https://themuselab.kr/api/track";

function sessionId(): string {
  const w = window as unknown as { __syak_sid?: string };
  if (!w.__syak_sid) w.__syak_sid = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return w.__syak_sid;
}

export class HttpAnalyticsSink implements AnalyticsSink {
  constructor(private readonly platform: "toss" | "web" = "toss") {}

  send(event: AnalyticsEvent): void {
    try {
      fetch(`${ENDPOINT}?app=syak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...event, sessionId: sessionId(), ts: Date.now(), platform: this.platform }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // silent
    }
  }
}
