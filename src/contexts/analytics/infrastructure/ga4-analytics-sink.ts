import type { AnalyticsSink } from "../ports/analytics-sink";
import type { AnalyticsEvent } from "../domain/event";
import { device } from "../../../shared/platform/visitor";
import { analyticsDelivery as delivery } from "../../../shared/platform/analytics-runtime";
import { NAME_MAP, eventPayload } from "./event-payload";

/** GA, GTM dataLayer and Hackle receive the same event contract. */
export class GA4AnalyticsSink implements AnalyticsSink {
  constructor(private readonly platform: "toss" | "web" = "web") {}
  send(event: AnalyticsEvent): void {
    delivery.send(NAME_MAP[event.event] ?? event.event, {
      ...eventPayload(event), platform: this.platform, device,
    });
  }
}
