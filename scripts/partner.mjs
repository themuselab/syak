#!/usr/bin/env node
/**
 * 파트너샵 등록·해제·목록 — 관리자 페이지 없이 팀이 직접 쓴다(백엔드 POST/GET /internal/partners).
 *
 *   node scripts/partner.mjs add <네이버 플레이스 링크|ID> [--code] [--name=이름] [--address=주소] [--category=네일]
 *                                                                     등록 (+ 사장님 인증코드 발급)
 *     DB에 없는 매장인데 네이버 요약 조회가 막히면 --name(필수)·--address로 만든다 — 사진·메뉴·좌표는 sync_partners가 채움.
 *   node scripts/partner.mjs remove <링크|ID>                        해제
 *   node scripts/partner.mjs list [--menus]                           목록 (+ 메뉴로 업종 확인, 조회수 안 남음)
 *
 * env: API_BASE_URL, INTERNAL_API_KEY. 선택: DISCORD_WEBHOOK(+ HIDE_CODE=1이면 인증코드를 화면 대신 디코로만 —
 * 공개 레포 Actions 로그에 코드가 남지 않게 partner.yml이 이렇게 쓴다).
 * 의존성 없음(Node 20 fetch)
 */
const BASE = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY;
const WEBHOOK = process.env.DISCORD_WEBHOOK;
const HIDE_CODE = process.env.HIDE_CODE === '1';
if (!BASE || !KEY) { console.error('❌ API_BASE_URL / INTERNAL_API_KEY 필요'); process.exit(1); }

const [cmd, place, ...rest] = process.argv.slice(2);
const wantCode = rest.includes('--code');
const opt = (k) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3).trim() || undefined;
const api = async (method, path, body) => {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'X-Internal-Key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  // process.exit는 Windows에서 진행 중인 fetch 핸들과 겹쳐 libuv assertion으로 죽는다 → 던지고 맨 아래에서 처리
  if (!r.ok) throw new Error(`${r.status} ${json.code ?? ''} ${json.message ?? ''} ${json.details ? JSON.stringify(json.details) : ''}`);
  return json;
};
const discord = (content) => WEBHOOK
  ? fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: '샥 파트너', content }) })
  : Promise.resolve();

try {
if (cmd === 'list') {
  const { partners } = await api('GET', '/internal/partners');
  console.log(`파트너샵 ${partners.length}곳`);
  const full = rest.includes('--menus') || place === '--menus';
  for (const p of partners) {
    console.log(`- ${p.name} (${p.gu || '-'}) · id ${p.id} · 업종 ${(p.categories || []).join(',') || '-'}`
      + `${p.has_coord ? '' : ' · ⚠️좌표없음'} · 사장님 ${p.owners} · 30일 빈자리 ${p.owner_slots_30d}`);
    if (full) console.log(`    주소: ${p.road || '-'}`);
    if (full) console.log(`    메뉴: ${(p.menus || []).slice(0, 10).join(' / ') || '(아직 동기화 전)'}`);
  }
} else if (cmd === 'add' || cmd === 'remove') {
  if (!place) throw new Error('네이버 플레이스 링크나 ID를 넣어주세요');
  const r = await api('POST', '/internal/partners', {
    place, partner: cmd === 'add', issueCode: cmd === 'add' && wantCode,
    name: opt('name'), address: opt('address'), category: opt('category'),
  });
  const verb = cmd === 'add' ? (r.created ? '새로 만들고 파트너 등록' : '파트너 등록') : '파트너 해제';
  console.log(`✅ ${r.name} (id ${r.shopId}) ${verb}`);
  if (r.code) {
    const line = `🔑 ${r.name} 사장님 인증코드: **${r.code.code}** (만료 ${String(r.code.expiresAt).slice(0, 10)}) — owner.themuselab.kr 로그인 후 입력`;
    if (HIDE_CODE) { await discord(line); console.log('🔑 인증코드 발급됨 — 디스코드에서 확인하세요(공개 로그에는 남기지 않음)'); }
    else console.log(line.replace(/\*\*/g, ''));
  }
  await discord(`🤝 ${r.name} ${verb}${cmd === 'add' ? ' — 앱에 파트너 핀·배지·빈자리 알림이 켜져요(상세 사진은 1시간 안에 갱신)' : ''}`);
} else {
  console.log('사용법: node scripts/partner.mjs add <링크|ID> [--code] | remove <링크|ID> | list');
  process.exitCode = 1;
}
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exitCode = 1;
}
