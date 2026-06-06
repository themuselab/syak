import { forwardRef, type ReactNode } from "react";
import { Sheet, type SheetRef } from "react-modal-sheet";

type Props = {
  children: ReactNode;
  snapPoints?: number[]; // px 높이, 큰 값(full) → 작은 값(peek) 순
  initialSnap?: number;
  onSnap?: (i: number) => void;
  mountPoint?: Element; // App 컨테이너 안에 mount → z-index 정상화(오버레이가 시트 위)
};

/** 스냅 포인트 바텀시트 (peek↔full). 드래그 어디서나 + 스크롤↔접힘 자동 조율.
 *  항상 떠있는 비모달 시트(닫히지 않음). 배경(Backdrop) 없음 → 지도 보임. */
export const SnapSheet = forwardRef<SheetRef, Props>(function SnapSheet(
  { children, snapPoints = [760, 420, 165], initialSnap = 2, onSnap, mountPoint },
  ref,
) {
  return (
    <Sheet
      ref={ref}
      isOpen
      onClose={() => {}}
      disableDismiss
      snapPoints={snapPoints}
      initialSnap={initialSnap}
      detent="default"
      onSnap={onSnap}
      mountPoint={mountPoint}
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
