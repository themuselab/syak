#!/usr/bin/env node
/**
 * GA4 일일 지표를 디스코드로 보낸다.
 *   node scripts/ga4-discord.mjs
 *
 * env: GA4_PROPERTY_ID, GA4_SA_KEY(서비스계정 JSON base64),
 *      DISCORD_WEBHOOK(또는 DISCORD_WEBHOOK_APP)
 * 의존성: @google-analytics/data (워크플로에서 격리 설치)
 */
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const PROPERTY = `properties/${process.env.GA4_PROPERTY_ID}`;
const WEBHOOK = process.env.DISCORD_WEBHOOK || process.env.DISCORD_WEBHOOK_APP;
const SA = process.env.GA4_SA_KEY;

if (!process.env.GA4_PROPERTY_ID || !SA) { console.error('❌ GA4_PROPERTY_ID / GA4_SA_KEY 필요'); process.exit(1); }

const cred = JSON.parse(Buffer.from(SA, 'base64').toString('utf-8'));
const client = new BetaAnalyticsDataClient({
  credentials: { client_email: cred.client_email, private_key: cred.private_key },
});
const num = v => Number(v ?? 0) || 0;

async function metric(metricName, { start, end = 'today', event } = {}) {
  const [res] = await client.runReport({
    property: PROPERTY,
    dateRanges: [{ startDate: start, endDate: end }],
    metrics: [{ name: metricName }],
    ...(event ? { dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: event } } } } : {}),
  });
  return num(res.rows?.[0]?.metricValues?.[0]?.value);
}

async function top(dimension, metricName, { start, end = 'today', event, limit = 5 } = {}) {
  const [res] = await client.runReport({
    property: PROPERTY,
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: dimension }],
    metrics: [{ name: metricName }],
    ...(event ? { dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: event } } } } : {}),
    orderBys: [{ metric: { metricName }, desc: true }],
    limit,
  });
  return (res.rows ?? []).map(r => ({ key: r.dimensionValues?.[0]?.value ?? '(없음)', value: num(r.metricValues?.[0]?.value) }));
}

const YtoD = { start: 'yesterday', end: 'yesterday' };

const [
  yUsers, ySessions, yReserve, yViews, yDwell,
  w7Users, w7Reserve,
  m30Users, m30Reserve, m30Views,
  topShops, acq,
] = await Promise.all([
  metric('activeUsers', YtoD),
  metric('sessions', YtoD),
  metric('eventCount', { ...YtoD, event: 'reserve_click' }),
  metric('eventCount', { ...YtoD, event: 'shop_view' }),
  metric('averageSessionDuration', YtoD), // 평균 체류(초) — 기존 리포트 dwell 대체
  metric('activeUsers', { start: '7daysAgo' }),
  metric('eventCount', { start: '7daysAgo', event: 'reserve_click' }),
  metric('activeUsers', { start: '30daysAgo' }),
  metric('eventCount', { start: '30daysAgo', event: 'reserve_click' }),
  metric('eventCount', { start: '30daysAgo', event: 'shop_view' }),
  top('customEvent:shop_id', 'eventCount', { start: '7daysAgo', event: 'shop_view', limit: 5 }),
  // 채널 그룹(Direct/Organic Social/Referral…)이 날것 소스보다 읽기 좋음. 노이즈는 아래서 정리
  top('sessionDefaultChannelGroup', 'sessions', { start: '7daysAgo', limit: 8 }),
]);

const convRate = m30Views ? ((m30Reserve / m30Views) * 100).toFixed(1) + '%' : '-';

// 샵 이름 매핑(백엔드 internal API, RDS). 실패하면 shop_id 그대로.
let names = {};
try {
  const ids = topShops.map(s => s.key).filter(x => x && x !== '(없음)' && x !== '(not set)');
  const base = process.env.API_BASE_URL, key = process.env.INTERNAL_API_KEY;
  if (ids.length && base && key) {
    const r = await fetch(`${base.replace(/\/$/, '')}/internal/shops/meta?ids=${encodeURIComponent(ids.join(','))}`, {
      headers: { 'X-Internal-Key': key },
    });
    if (r.ok) for (const s of (await r.json()).shops ?? []) names[s.id] = s.name;
    else console.error('⚠️ 샵 이름 매핑 실패', r.status);
  }
} catch (e) { console.error('⚠️ 샵 이름 매핑 skip', e.message); }

const shopLines = topShops.length
  ? topShops.map((s, i) => `${i + 1}. ${names[s.key] || s.key} — ${s.value.toLocaleString()}회`).join('\n')
  : '데이터 없음';

// 유입 경로: 미확인/처리중 값은 '미확인'으로 합치고, 채널은 한글 라벨로
const CHANNEL_KR = {
  'Direct': '직접 유입', 'Organic Social': '소셜(인스타 등)', 'Referral': '추천 링크',
  'Organic Search': '검색', 'Paid Social': '소셜 광고', 'Paid Search': '검색 광고',
  'Unassigned': '미확인', '(not set)': '미확인', '(data not available)': '미확인',
};
const acqMap = new Map();
for (const a of acq) {
  const label = CHANNEL_KR[a.key] ?? a.key;
  acqMap.set(label, (acqMap.get(label) ?? 0) + a.value);
}
const acqSorted = [...acqMap.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);
const acqLines = acqSorted.length
  ? acqSorted.map(([k, v]) => `${k} — ${v.toLocaleString()}`).join('\n')
  : '데이터 없음';

// 파트너샵(온보딩 샵) 조회·예약클릭 — 백엔드 internal API (RDS 파트너 집합 × GA4)
let partner = null;
try {
  const base = process.env.API_BASE_URL, key = process.env.INTERNAL_API_KEY;
  if (base && key) {
    const pr = await fetch(`${base.replace(/\/$/, '')}/internal/partner-engagement?period=7d`, {
      headers: { 'X-Internal-Key': key },
    });
    if (pr.ok) partner = await pr.json();
    else console.error('⚠️ 파트너 지표 조회 실패', pr.status);
  }
} catch (e) { console.error('⚠️ 파트너 지표 skip', e.message); }

const partnerField = partner ? [{
  name: '파트너샵 (7일, 조회·예약클릭)',
  value: `조회 ${Number(partner.views).toLocaleString()} · 예약클릭 ${Number(partner.clicks).toLocaleString()}`
       + `  ·  파트너 ${partner.partnerCount}개(연동 ${partner.linkedCount})`
       + (partner.views === 0 && partner.clicks === 0 ? '\n아직 파트너샵으로 유입된 조회·클릭이 없어요' : ''),
  inline: false,
}] : [];

const embed = {
  title: '📊 GA4 일일 리포트 (샥)',
  color: 0xec4899,
  fields: [
    { name: '어제', value: `활성 ${yUsers.toLocaleString()} · 세션 ${ySessions.toLocaleString()} · 상세조회 ${yViews.toLocaleString()} · 예약클릭 ${yReserve.toLocaleString()} · 평균체류 ${Math.round(yDwell)}초`, inline: false },
    { name: '최근 7일', value: `활성 ${w7Users.toLocaleString()} · 예약클릭 ${w7Reserve.toLocaleString()}`, inline: true },
    { name: '최근 30일', value: `MAU ${m30Users.toLocaleString()} · 예약클릭 ${m30Reserve.toLocaleString()} · 전환율 ${convRate}`, inline: true },
    { name: '인기 샵 Top5 (7일, 상세조회)', value: shopLines, inline: false },
    { name: '유입 채널 Top5 (7일, 세션)', value: acqLines, inline: false },
    ...partnerField,
  ],
  timestamp: new Date().toISOString(),
  footer: { text: 'GA4 Data API' },
};

console.log(`GA4: 어제 활성 ${yUsers} · 30일 MAU ${m30Users} · 예약클릭(30일) ${m30Reserve}`);

if (!WEBHOOK) { console.error('⚠️ DISCORD_WEBHOOK 없음 — 콘솔 출력만'); process.exit(0); }
const res = await fetch(WEBHOOK, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: '샥 GA4', embeds: [embed] }),
});
if (!res.ok) { console.error('❌ 디스코드 전송 실패', res.status, await res.text()); process.exit(1); }
console.log('✅ 디스코드 전송 완료');
