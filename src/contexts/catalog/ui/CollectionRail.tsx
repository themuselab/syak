import type { Collection } from "../domain/filters";
import type { ShopSummary } from "../domain/shop";
import { ShopCard } from "./ShopCard";

type Props = {
  collections: Collection[];
  onShopClick: (s: ShopSummary) => void;
  onCollectionView?: (key: string) => void;
};

/** 네이버지도식 가로 스크롤 컬렉션 묶음. */
export function CollectionRail({ collections, onShopClick }: Props) {
  return (
    <div style={{ paddingBottom: 12 }}>
      {collections
        .filter((c) => c.shops.length > 0)
        .map((c) => (
          <section key={c.key} style={{ marginTop: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 16px 8px" }}>
              {c.title}{" "}
              <span style={{ color: "#bbb", fontWeight: 400 }}>{c.shops.length}</span>
            </h3>
            <div
              style={{
                display: "flex",
                gap: 12,
                overflowX: "auto",
                padding: "0 16px 4px",
                scrollbarWidth: "none",
              }}
            >
              {c.shops.map((s) => (
                <ShopCard key={s.id} shop={s} onClick={onShopClick} variant="rail" />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
