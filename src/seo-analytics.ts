import { analyticsDelivery } from './shared/platform/analytics-runtime';
import { installInteractionTracking, type EventProperties } from './shared/platform/analytics-delivery';

const w = window as Window & {
  syakQueue?: [string, EventProperties][];
  syakTrack?: (command: string, name: string, params: EventProperties) => void;
};
const send = (name: string, params: EventProperties) => analyticsDelivery.send(name, { ...params, platform: 'web' });
const queued = w.syakQueue ?? [];
w.syakQueue = [];
w.syakTrack = (_command, name, params) => send(name, params);
for (const [name, params] of queued) send(name, params);
installInteractionTracking(send);
