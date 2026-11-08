import type { AnalyticsEvent, EventName } from '../domain/event';
import type { EventProperties } from '../../../shared/platform/analytics-delivery';

export const NAME_MAP: Partial<Record<EventName, string>> = {
  detail_view: 'shop_view', pin_click: 'map_pin_click',
  session_start: 'service_enter', session_end: 'service_leave',
};
export function eventPayload(event: AnalyticsEvent): EventProperties {
  const params: EventProperties = { ...event.properties };
  const fields = {
    shop_id: event.shopId, shop_category: event.shopCategory, shop_district: event.shopDistrict,
    route: event.route, entry: event.entry, source: event.source, ms: event.ms,
    slot_date: event.slotDate, slot_time: event.slotTime, placement: event.placement, store: event.store,
    reservation_method: event.event === 'reserve_click' ? event.route : undefined,
    shop_type: event.isPartner === undefined ? undefined : event.isPartner ? 'partner' : 'general',
    is_partner: event.isPartner === undefined ? undefined : event.isPartner ? 1 : 0,
  };
  for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== '') params[key] = value;
  return params;
}
