import { useEffect, useRef, useState } from 'react';
import { analyticsDelivery } from './analytics-runtime';

type Decision = Awaited<ReturnType<typeof analyticsDelivery.decideNaverCta>>;

export function useNaverCta(shopId: string, isPartner: boolean, eligible: boolean) {
  const [result, setResult] = useState<{ shopId: string; decision: Decision }>();
  const decision = eligible && result?.shopId === shopId ? result.decision : undefined;
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    abort.current = controller;
    void analyticsDelivery.decideNaverCta(controller.signal).then(value => {
      if (!controller.signal.aborted) setResult({ shopId, decision: value });
    });
    return () => controller.abort();
  }, [shopId, eligible]);
  useEffect(() => {
    if (decision) analyticsDelivery.send('booking_cta_view', { platform: 'web', shop_id: shopId, shop_type: isPartner ? 'partner' : 'general', experiment_key: 5, variation: decision.variation });
  }, [decision, shopId, isPartner]);
  return { label: decision?.variation === 'B' ? decision.label : undefined,
    onInteraction() { abort.current?.abort(); } };
}
