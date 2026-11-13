import { createAnalyticsDelivery } from './analytics-delivery';
import { clientId } from './visitor';
import { createClarityTracking } from './behavior-tracking';

export const analyticsDelivery = createAnalyticsDelivery({
  sdkKey: import.meta.env.VITE_HACKLE_SDK_KEY,
  gtmId: import.meta.env.VITE_GTM_ID,
  transport: import.meta.env.VITE_ANALYTICS_TRANSPORT,
  deviceId: clientId,
  onEvent: createClarityTracking(import.meta.env.VITE_CLARITY_PROJECT_ID ?? 'zd1l2cqi0i'),
});
