// 유스케이스 ↔ React 연결 훅. UI는 이 훅으로만 데이터에 접근.
import { useCallback, useEffect, useMemo, useState } from "react";
import { usecases } from "../../../../app/composition-root";
import type { ShopSummary } from "../../domain/shop";
import type { FilterCriteria, Collection } from "../../domain/filters";

export function useCatalog() {
  const [allShops, setAllShops] = useState<ShopSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterCriteria>({});

  useEffect(() => {
    let alive = true;
    usecases.catalog
      .searchShops({})
      .then((shops) => {
        if (alive) {
          setAllShops(shops);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const shops = useMemo(
    () => allShops.filter((s) => matches(s, filter)),
    [allShops, filter],
  );

  const collections: Collection[] = useMemo(
    () => (allShops.length ? buildLocalCollections(allShops, filter) : []),
    [allShops, filter],
  );

  const searchByName = useCallback(
    (q: string) => usecases.catalog.searchByName(q),
    [],
  );

  return { shops, allShops, collections, loading, error, filter, setFilter, searchByName };
}

// domain filter를 클라이언트에서도 재사용 (동일 규칙)
import { matchesFilter as matches } from "../../domain/filters";
import { buildCollections, applyFilter } from "../../domain/filters";

function buildLocalCollections(all: ShopSummary[], filter: FilterCriteria): Collection[] {
  // 지역만 반영해서 컬렉션 구성 (가격/혜택 필터는 컬렉션 자체가 분류라 제외)
  const scoped = applyFilter(all, { gu: filter.gu });
  return buildCollections(scoped);
}
