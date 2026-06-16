// 유입 경로 해석 — 정확도 우선순위로 신호를 조합한다.
//   1) utm_source (직접 태깅, 최고 신뢰)
//   2) 클릭ID: fbclid(메타광고)·gclid(구글)·igshid(인스타공유)
//   3) 인앱 브라우저 UA — 인스타/페북/스레드 웹뷰는 referrer를 비워 보내는 일이 많아 UA가 핵심
//   4) referrer 호스트
//   5) 직접/링크
// entry로 광고(campaign) vs 자연유입(deeplink/share) vs 직접(organic)을 구분.

import type { EntryRoute } from "../../contexts/analytics/domain/event";

export interface Attribution {
  source: string; // instagram | facebook | threads | kakao | naver | google | twitter | direct | <host/utm>
  entry: EntryRoute; // campaign(태깅/광고) | deeplink(인앱/리퍼러) | share | organic(직접)
  raw: string; // 어떤 신호로 판정했는지 (디버그)
}

function param(name: string): string {
  try {
    return new URLSearchParams(window.location.search).get(name) || "";
  } catch {
    return "";
  }
}

// 원천 호스트/문자열 → 표준 소스명
function normSource(s: string): string {
  const v = s.toLowerCase();
  if (/instagram|ig\b/.test(v)) return "instagram";
  if (/facebook|fb\b|meta/.test(v)) return "facebook";
  if (/thread|barcelona/.test(v)) return "threads";
  if (/kakao/.test(v)) return "kakao";
  if (/naver/.test(v)) return "naver";
  if (/google/.test(v)) return "google";
  if (/twitter|t\.co|x\.com/.test(v)) return "twitter";
  return v.replace(/^www\./, "");
}

// 광고(유료) 매체 표기 — utm_medium에 이게 있으면 '광고', 없으면 자연유입.
const PAID_MEDIUM = /cpc|ppc|paid|ads?\b|display/;

export function resolveAttribution(): Attribution {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent : "").toLowerCase();
  const utm = (param("utm_source") || param("src")).trim();
  const medium = param("utm_medium").toLowerCase();
  const fbclid = param("fbclid");
  const gclid = param("gclid");
  const igshid = param("igshid");
  let ref = "";
  try {
    ref = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : "";
  } catch {
    /* ignore */
  }

  // 1) 명시적 UTM — 가장 신뢰. 광고/자연은 utm_medium으로 가른다(프로필 링크에 태깅해도 자연으로 유지).
  if (utm) {
    return { source: normSource(utm), entry: PAID_MEDIUM.test(medium) ? "campaign" : "deeplink", raw: `utm:${utm}/${medium || "-"}` };
  }

  // 2) 클릭 ID
  if (gclid) return { source: "google", entry: "campaign", raw: "gclid" }; // 구글 광고 클릭 = 유료 확정
  if (fbclid) {
    // fbclid는 광고·자연 둘 다 붙는다 → 유료 단정 불가. 출처만 인스타/페북으로, 자연(social)로 본다.
    const src = /instagram/.test(ua) ? "instagram" : "facebook";
    return { source: src, entry: "deeplink", raw: "fbclid" };
  }
  if (igshid) return { source: "instagram", entry: "share", raw: "igshid" };

  // 3) 인앱 브라우저 UA — referrer가 비어도 잡힌다
  if (/instagram/.test(ua)) return { source: "instagram", entry: "deeplink", raw: "ua:instagram" };
  if (/fban|fbav|fb_iab/.test(ua)) return { source: "facebook", entry: "deeplink", raw: "ua:facebook" };
  if (/threads|barcelona/.test(ua)) return { source: "threads", entry: "deeplink", raw: "ua:threads" };
  if (/kakaotalk/.test(ua)) return { source: "kakao", entry: "deeplink", raw: "ua:kakao" };
  if (/naver\(inapp|naver_search|naverapp/.test(ua)) return { source: "naver", entry: "deeplink", raw: "ua:naver" };
  if (/line\//.test(ua)) return { source: "line", entry: "deeplink", raw: "ua:line" };

  // 4) referrer 호스트
  if (ref) return { source: normSource(ref), entry: "deeplink", raw: `ref:${ref}` };

  // 5) 직접 / 링크 (친구 공유·저장 등)
  return { source: "direct", entry: "organic", raw: "direct" };
}
