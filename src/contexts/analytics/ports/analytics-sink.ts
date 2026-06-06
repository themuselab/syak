// Analytics 포트 — 이벤트 적재(쓰기) 인터페이스. 구현은 infrastructure/.
import type { AnalyticsEvent } from "../domain/event";

export interface AnalyticsSink {
  send(event: AnalyticsEvent): void; // fire-and-forget (실패 silent)
}
