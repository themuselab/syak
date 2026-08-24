// 한글 지역명 → URL 슬러그(개정 로마자, 음절 단위) + 행정접미(구/시/군) 제거.
// SEO 영문 URL(/nail/gangnam/)과 사이트맵에서 공유. 정확도 위해 예외는 OVERRIDES로.
const CHO = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
const JUNG = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
const JONG = ['','k','k','k','n','n','n','t','l','k','m','l','l','l','p','l','m','p','p','t','t','ng','t','t','k','t','p','t'];

// 음절 단위 개정 로마자 (연음/자음동화 미적용 — 지역명 슬러그엔 충분, 예외만 OVERRIDES).
function romanizeSyllables(str) {
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const s = code - 0xac00;
      const jong = s % 28;
      const jung = ((s - jong) / 28) % 21;
      const cho = (((s - jong) / 28) - jung) / 21;
      out += CHO[cho] + JUNG[jung] + JONG[jong];
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    }
    // 그 외(공백 등)는 호출부에서 분리 처리하므로 여기선 무시
  }
  return out;
}

// 자음동화 등으로 음절단위 로마자가 관용 표기와 다른 지역 (전체 한글명 → 최종 슬러그)
const OVERRIDES = {
  '종로구': 'jongno',
  '중랑구': 'jungnang',
  '강릉시': 'gangneung',
  '밀양시': 'miryang',
  '부산 동래구': 'busan-dongnae',
};

// 행정 접미 1글자 제거(구/시/군). '일산'처럼 없으면 그대로.
function stripSuffix(part) {
  return part.replace(/[구시군]$/u, '');
}

/** 한글 지역명 → 슬러그. 수도권 접두(공백)면 '접두-구'로 결합해 중복(중구 등) 방지. */
function slugFor(name) {
  const key = String(name || '').trim();
  if (OVERRIDES[key]) return OVERRIDES[key];
  const parts = key.split(/\s+/);
  if (parts.length > 1) {
    const metro = romanizeSyllables(parts[0]);            // 인천/부산/…
    const rest = romanizeSyllables(stripSuffix(parts.slice(1).join('')));
    return `${metro}-${rest}`;
  }
  return romanizeSyllables(stripSuffix(key));
}

export { slugFor, romanizeSyllables };
