import { useRef, type ReactNode } from "react";

type Snap = "peek" | "full";

type Props = {
  snap: Snap;
  onSnapChange: (s: Snap) => void;
  peekHeight?: number; // px
  children: ReactNode;
};

const SHEET_VH = 86; // 시트 전체 높이(vh). 항상 이 높이로 두고 transform으로 슬라이드.

/** 2단 스냅 바텀시트 (peek ↔ full).
 *  height 대신 transform: translateY 로 애니메이션 → reflow 없이 부드럽게. */
export function BottomSheet({ snap, onSnapChange, peekHeight = 220, children }: Props) {
  const startY = useRef<number | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    startY.current = e.clientY;
  }
  function onPointerUp(e: React.PointerEvent) {
    if (startY.current == null) return;
    const dy = e.clientY - startY.current;
    if (dy < -30) onSnapChange("full");
    else if (dy > 30) onSnapChange("peek");
    else onSnapChange(snap === "full" ? "peek" : "full");
    startY.current = null;
  }

  // full=올림(0), peek=내림(전체높이 - peek 만큼 아래로)
  const translateY = snap === "full" ? "0px" : `calc(${SHEET_VH}vh - ${peekHeight}px)`;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: `${SHEET_VH}vh`,
        transform: `translateY(${translateY})`,
        transition: "transform .28s cubic-bezier(.4,0,.2,1)",
        willChange: "transform",
        background: "#fff",
        borderRadius: "18px 18px 0 0",
        boxShadow: "0 -4px 24px rgba(0,0,0,.12)",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        style={{ padding: "10px 0 6px", cursor: "grab", touchAction: "none", flexShrink: 0 }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#ddd", margin: "0 auto" }} />
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {children}
      </div>
    </div>
  );
}
