import { createAnalyticsDelivery } from './analytics-delivery';
import { clientId } from './visitor';
import { createBehaviorTracking } from './behavior-tracking';

export const analyticsDelivery = createAnalyticsDelivery({
  sdkKey: import.meta.env.VITE_HACKLE_SDK_KEY,
  gtmId: import.meta.env.VITE_GTM_ID,
  transport: import.meta.env.VITE_ANALYTICS_TRANSPORT,
  deviceId: clientId,
  onEvent: createBehaviorTracking(`${(import.meta.env.VITE_API_BASE_URL ?? 'https://api.themuselab.kr/api/v1').replace(/\/$/, '')}/analytics/events`, import.meta.env.VITE_CLARITY_PROJECT_ID ?? 'zd1l2cqi0i'),
});
