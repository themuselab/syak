// 유스케이스 ↔ React 연결 훅. 뷰포트(지도 영역) 기반 로딩 — egress 절약.
import { useCallback, useMemo, useState } from "react";
import { usecases } from "../../../../app/composition-root";
import type { ShopSummary, ShopPin } from "../../domain/shop";
import { matchesFilter } from "../../domain/filters";
import type { FilterCriteria } from "../../domain/filters";
import type { Bounds } from "../../ports/shop-repository";

export function useCatalog() {
  const [loaded, setLoaded] = useState<ShopSummary[]>([]); // 리스트용 요약 (영역 내, 소량)
  const [pins, setPins] = useState<ShopPin[]>([]); // 지도 마커용 경량 핀 (영역 내, 대량)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterCriteria>({});

  // 지도 영역 안: 리스트 요약(소량) + 지도 핀(대량) 동시 로드
  const loadBounds = useCallback(async (b: Bounds): Promise<void> => {
    try {
      const [sum, pn] = await Promise.all([
        usecases.catalog.inBounds(b, 300),
        usecases.catalog.pinsInBounds(b, 5000),
      ]);
      setLoaded(sum);
      setPins(pn);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 직접 세팅 (지역선택·이름검색 결과 등) — 지도 핀도 그 셋으로 맞춤
  const showShops = useCallback((s: ShopSummary[]) => {
    setLoaded(s);
    setPins(s); // ShopSummary는 ShopPin 필드를 모두 가짐
    setLoading(false);
  }, []);

  const searchByName = useCallback((q: string) => usecases.catalog.searchByName(q), []);

  // 필터(분야/가격/시술/혜택) 적용 — 로드된 셋 안에서 클라이언트 필터
  const shops = useMemo(() => loaded.filter((s) => matchesFilter(s, filter)), [loaded, filter]);

  return { shops, pins, loading, error, filter, setFilter, loadBounds, showShops, searchByName };
}
