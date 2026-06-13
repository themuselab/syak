import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { Sheet, type SheetRef } from "react-modal-sheet";

type Props = {
  children: ReactNode;
  // v5 규칙: 오름차순, 0(닫힘)으로 시작, 1(완전 열림)로 끝. 값=보이는 높이 비율.
  // [0, 0.3, 0.6, 1] → idx1=peek 30%, idx2=mid 60%, idx3=full
  snapPoints?: number[];
  initialSnap?: number;
  onSnap?: (i: number) => void;
  mountPoint?: Element; // App 컨테이너 안에 mount → z-index 정상화(오버레이가 시트 위)
};

/** 스냅 포인트 바텀시트 (peek↔full). 드래그 어디서나 + 스크롤↔접힘 자동 조율.
 *  항상 떠있는 비모달 시트(닫히지 않음). 배경(Backdrop) 없음 → 지도 보임.
 *  react-modal-sheet의 initialSnap이 안 먹는 케이스가 있어 마운트 후 강제 snapTo. */
export const SnapSheet = forwardRef<SheetRef, Props>(function SnapSheet(
  { children, snapPoints = [0, 0.3, 0.6, 1], initialSnap = 1, onSnap, mountPoint },
  forwardedRef,
) {
  const innerRef = useRef<SheetRef | null>(null);

  function setRefs(el: SheetRef | null) {
    innerRef.current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  }

  useEffect(() => {
    const t = setTimeout(() => innerRef.current?.snapTo(initialSnap), 60);
    return () => clearTimeout(t);
  }, [initialSnap]);

  return (
    <Sheet
      ref={setRefs}
      isOpen
      onClose={() => {}}
      disableDismiss
      snapPoints={snapPoints}
      initialSnap={initialSnap}
      detent="default"
      onSnap={onSnap}
      mountPoint={mountPoint}
      // 항상 열린 시트라 전역 스크롤락이 늘 켜져 위에 뜨는 모달(필터·지역)의 스크롤을 막음 → 해제.
      // 배경(App)은 position:fixed라 락이 애초에 불필요.
      disableScrollLocking
      style={{ zIndex: 20, position: "absolute" }}
    >
      <Sheet.Container
        style={{ borderRadius: "18px 18px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,.12)" }}
      >
        <Sheet.Header />
        <Sheet.Content>{children}</Sheet.Content>
      </Sheet.Container>
    </Sheet>
  );
});
