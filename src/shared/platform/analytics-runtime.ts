import { createAnalyticsDelivery } from './analytics-delivery';
import { clientId } from './visitor';

export const analyticsDelivery = createAnalyticsDelivery({
  sdkKey: import.meta.env.VITE_HACKLE_SDK_KEY,
  gtmId: import.meta.env.VITE_GTM_ID,
  transport: import.meta.env.VITE_ANALYTICS_TRANSPORT,
  deviceId: clientId,
});
