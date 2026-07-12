// 공통 값객체 — 뷰티 카테고리. 순수.
export const CATEGORIES = ["네일", "헤어", "속눈썹", "왁싱", "반영구", "피부", "마사지", "태닝"] as const;
export type Category = (typeof CATEGORIES)[number];

// 서울 25개 자치구
export const SEOUL_GU = [
  "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구",
  "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구",
  "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구",
] as const;

// 경기 시 (데이터 저장 라벨과 동일 — 시 단위 필터)
export const GYEONGGI_SI = [
  "수원시",
  "성남시", "고양시", "부천시", "안양시", "안산시", "남양주시", "용인시",
  "광명시", "하남시", "구리시", "과천시", "의정부시", "김포시", "시흥시", "군포시", "의왕시",
  // 경기 나머지
  "화성시", "평택시", "파주시", "광주시", "오산시", "이천시", "안성시",
  "여주시", "양평군", "포천시", "동두천시", "양주시", "가평군", "연천군",
] as const;

// 인천 광역시 (저장 라벨과 동일)
export const INCHEON_GU = [
  "인천 중구", "인천 동구", "인천 미추홀구", "인천 연수구", "인천 남동구",
  "인천 부평구", "인천 계양구", "인천 서구", "인천 강화군",
] as const;

// 부산 광역시 (저장 라벨 "부산 {구}")
export const BUSAN_GU = [
  "부산 중구", "부산 서구", "부산 동구", "부산 영도구", "부산 부산진구", "부산 동래구",
  "부산 남구", "부산 북구", "부산 해운대구", "부산 사하구", "부산 금정구", "부산 강서구",
  "부산 연제구", "부산 수영구", "부산 사상구", "부산 기장군",
] as const;

// 대구 광역시 (저장 라벨 "대구 {구}")
export const DAEGU_GU = [
  "대구 중구", "대구 동구", "대구 서구", "대구 남구", "대구 북구",
  "대구 수성구", "대구 달서구", "대구 달성군",
] as const;

// 광주 광역시 (저장 라벨 "광주 {구}")
export const GWANGJU_GU = ["광주 동구", "광주 서구", "광주 남구", "광주 북구", "광주 광산구"] as const;

// 대전 광역시 (저장 라벨 "대전 {구}")
export const DAEJEON_GU = ["대전 중구", "대전 동구", "대전 서구", "대전 유성구", "대전 대덕구"] as const;

// 울산 광역시 (저장 라벨 "울산 {구}")
export const ULSAN_GU = ["울산 중구", "울산 남구", "울산 동구", "울산 북구", "울산 울주군"] as const;

// 세종
export const SEJONG_SI = ["세종시"] as const;

// 경상 (경남: 창원·진주·김해·양산·거제·통영·사천·밀양·함안·거창 / 경북: 포항·구미·경산·경주·안동·김천·영주)
export const GYEONGSANG_SI = [
  "창원시", "김해시", "양산시", "거제시", "통영시", "진주시", "사천시", "밀양시", "함안군", "거창군",
  "포항시", "구미시", "경산시", "경주시", "안동시", "김천시", "영주시",
] as const;

// 전라 (전북: 전주·익산·군산·정읍·남원 / 전남: 여수·순천·목포·광양·나주)
export const JEOLLA_SI = [
  "전주시", "익산시", "군산시", "정읍시", "남원시",
  "여수시", "순천시", "목포시", "광양시", "나주시",
] as const;

// 강원
export const GANGWON_SI = ["춘천시", "원주시", "강릉시", "속초시", "동해시"] as const;

// 충청 (충북: 청주·충주·제천 / 충남: 천안·아산·서산·당진·공주)
export const CHUNGCHEONG_SI = ["청주시", "충주시", "제천시", "천안시", "아산시", "서산시", "당진시", "공주시"] as const;

// 제주
export const JEJU_SI = ["제주시", "서귀포시"] as const;

export type District =
  | (typeof SEOUL_GU)[number]
  | (typeof GYEONGGI_SI)[number]
  | (typeof INCHEON_GU)[number]
  | (typeof BUSAN_GU)[number]
  | (typeof DAEGU_GU)[number]
  | (typeof GWANGJU_GU)[number]
  | (typeof DAEJEON_GU)[number]
  | (typeof ULSAN_GU)[number]
  | (typeof SEJONG_SI)[number]
  | (typeof GYEONGSANG_SI)[number]
  | (typeof JEOLLA_SI)[number]
  | (typeof GANGWON_SI)[number]
  | (typeof CHUNGCHEONG_SI)[number]
  | (typeof JEJU_SI)[number];

// 예약 item에서 추출한 시술 태그 (backfill_booking.py의 SERVICE_TAGS 라벨과 동일)
// "젤네일 되는 샵 찾기" 발견 필터용
export const SERVICE_FILTERS = [
  "젤네일", "패디큐어", "네일아트", "손연장", "케어",
  "속눈썹", "왁싱", "반영구", "펌", "염색", "커트", "피부관리", "마사지", "태닝",
] as const;
