import { useRef, type ReactNode } from "react";

type Snap = "peek" | "full";

type Props = {
  snap: Snap;
  onSnapChange: (s: Snap) => void;
  peekHeight?: number; // px
  children: ReactNode;
};

/** 2단 스냅 바텀시트 (peek ↔ full). 핸들 드래그/탭으로 전환. */
export function BottomSheet({ snap, onSnapChange, peekHeight = 220, children }: Props) {
  const startY = useRef<number | null>(null);

  const height = snap === "full" ? "85vh" : `${peekHeight}px`;

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

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height,
        background: "#fff",
        borderRadius: "18px 18px 0 0",
        boxShadow: "0 -4px 24px rgba(0,0,0,.12)",
        zIndex: 20,
        transition: "height .25s ease",
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
      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>{children}</div>
    </div>
  );
}
