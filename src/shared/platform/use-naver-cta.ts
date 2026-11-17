// 실험 5(네이버 예약 버튼 문구)는 A(기존 문구) 승리로 종료했다(2026-11-17, 노출 326명: A 25.5% vs B 17.9%).
// 모두 기존 문구를 보여주고, 실험 판정·노출 이벤트(booking_cta_view)는 더 이상 보내지 않는다.
// 호출부(상세 예약 버튼)는 그대로 두고 label이 없으면 기존 문구를 쓰므로, 다음 문구 실험 때 이 훅만 다시 채우면 된다.
export function useNaverCta(shopId: string, isPartner: boolean, eligible: boolean): {
  label: string | undefined;
  onInteraction: () => void;
} {
  void shopId; void isPartner; void eligible;
  return { label: undefined, onInteraction() {} };
}
