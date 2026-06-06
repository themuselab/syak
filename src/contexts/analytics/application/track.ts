// Analytics 유스케이스 — 이벤트 추적. 포트만 의존.
import type { AnalyticsSink } from "../ports/analytics-sink";
import type { AnalyticsEvent } from "../domain/event";

export function makeTrack(sink: AnalyticsSink) {
  return function track(event: AnalyticsEvent): void {
    sink.send(event);
  };
}
