#!/usr/bin/env node
/**
 * 샥 앱 지표(최근 N시간)를 디스코드로 보낸다. 백엔드 internal API(RDS 집계)만 사용 — DB 직접 접속 없음.
 *   node scripts/app-discord.mjs
 *
 * env: API_BASE_URL, INTERNAL_API_KEY, DISCORD_WEBHOOK, REPORT_HOURS(기본 24), DRY_RUN(1이면 콘솔만)
 * 의존성 없음(Node 20 fetch)
 */
const BASE = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY;
const WEBHOOK = process.env.DISCORD_WEBHOOK;
const HOURS = Number(process.env.REPORT_HOURS || 24) || 24;

if (!BASE || !KEY) { console.error('❌ API_BASE_URL / INTERNAL_API_KEY 필요'); process.exit(1); }

const r = await fetch(`${BASE}/internal/app-metrics?hours=${HOURS}`, { headers: { 'X-Internal-Key': KEY } });
if (!r.ok) { console.error('❌ 앱 지표 조회 실패', r.status, await r.text()); process.exit(1); }
const m = await r.json();

// 항목별 조회 실패는 null → '-'
const n = v => (v == null ? '-' : Number(v).toLocaleString());
const p = m.partner;
const top = m.views.top?.length
  ? m.views.top.map((s, i) => `${i + 1}. ${String(s.name).slice(0, 16)} — ${n(s.views)}회`).join('\n')
  : '데이터 없음';
const convRate = p.totalCodes ? `${Math.round((p.totalCodesUsed / p.totalCodes) * 100)}%` : '-';

const stamp = `최근 ${m.hours}시간 · 서버 DB 집계`;
const embeds = [
  {
    title: `📱 샥 앱 지표 (최근 ${m.hours}시간)`,
    color: 0x6366f1,
    fields: [
      { name: '👤 신규 가입', value: `신규 ${n(m.users.new)}명 (누적 ${n(m.users.total)}명)`, inline: true },
      { name: '⭐ 즐겨찾기', value: `신규 ${n(m.favorites.new)}개 (누적 ${n(m.favorites.total)}개)`, inline: true },
      { name: '👁️ 앱 샵 상세 조회', value: `${n(m.views.total)}회 · 로그인 유저 ${n(m.views.users)}명`, inline: true },
      { name: '📍 관심 동네 설정', value: `${n(m.users.regionSet)}명`, inline: true },
      { name: '📲 푸시 등록 기기', value: `${n(m.users.pushDevices)}대`, inline: true },
      { name: '🏠 조회 TOP 샵', value: top, inline: false },
    ],
    footer: { text: stamp },
  },
  {
    title: '🔔 빈자리 알림',
    color: 0xf59e0b,
    fields: [
      { name: '알림 발송', value: `${n(m.notifications.sent)}건`, inline: true },
      { name: '안 읽음', value: `${n(m.notifications.unread)}건`, inline: true },
    ],
    footer: { text: stamp },
  },
  {
    title: '🤝 파트너 현황',
    color: 0x10b981,
    fields: [
      { name: '사장님 계정', value: `총 ${n(p.owners)}명 · 샵 연결 ${n(p.linked)}명`, inline: true },
      { name: '신규 사장님', value: `${n(p.newOwners)}명`, inline: true },
      { name: '인증코드', value: `${n(p.codesIssued)}개 발급 · ${n(p.codesUsed)}개 사용 · ${n(p.codesOpen)}개 대기`, inline: false },
      { name: '코드 전체 사용률', value: `${n(p.totalCodesUsed)}/${n(p.totalCodes)} (${convRate})`, inline: true },
      { name: '사장님 등록 빈자리', value: `신규 ${n(p.ownerSlotsNew)}개 · 총 ${n(p.ownerSlotsTotal)}개`, inline: true },
      { name: '전체 샵 / 오늘 이후 빈자리', value: `샵 ${n(m.catalog.shops)}개 · 빈자리 ${n(m.catalog.openSlots)}개`, inline: false },
    ],
    footer: { text: stamp },
  },
];

console.log(`앱 지표: 신규가입 ${n(m.users.new)} · 상세조회 ${n(m.views.total)} · 알림 ${n(m.notifications.sent)}`);
console.log(JSON.stringify(m, null, 2));

if (process.env.DRY_RUN === '1' || !WEBHOOK) { console.log('(DRY_RUN — 디스코드 전송 안 함)'); process.exit(0); }
const res = await fetch(WEBHOOK, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: '샥 앱봇', embeds }),
});
if (!res.ok) { console.error('❌ 디스코드 전송 실패', res.status, await res.text()); process.exit(1); }
console.log('✅ 디스코드 전송 완료');
