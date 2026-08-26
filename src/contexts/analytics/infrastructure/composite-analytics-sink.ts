// 여러 sink로 이벤트를 fan-out (GA4 + Meta 픽셀 등). 하나가 실패해도 나머지에 영향 없음.
import type { AnalyticsSink } from "../ports/analytics-sink";
import type { AnalyticsEvent } from "../domain/event";

export class CompositeAnalyticsSink implements AnalyticsSink {
  private readonly sinks: AnalyticsSink[];

  constructor(sinks: AnalyticsSink[]) {
    this.sinks = sinks;
  }

  send(event: AnalyticsEvent): void {
    for (const s of this.sinks) {
      try {
        s.send(event);
      } catch {
        /* 개별 sink 실패는 격리 (fire-and-forget) */
      }
    }
  }
}
