// 유스케이스 ↔ React 연결 훅. 뷰포트(지도 영역) 기반 로딩 — egress 절약.
import { useCallback, useMemo, useState } from "react";
import { usecases } from "../../../../app/composition-root";
import type { ShopSummary } from "../../domain/shop";
import { matchesFilter } from "../../domain/filters";
import type { FilterCriteria } from "../../domain/filters";
import type { Bounds } from "../../ports/shop-repository";

export function useCatalog() {
  const [loaded, setLoaded] = useState<ShopSummary[]>([]); // 현재 화면에 들고 있는 샵
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterCriteria>({});

  // 지도 영역 안의 샵 로드 (지도 이동 시)
  const loadBounds = useCallback(async (b: Bounds): Promise<void> => {
    try {
      const s = await usecases.catalog.inBounds(b);
      setLoaded(s);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 지역(구/시) 선택 → 그 지역 샵 로드. 호출측에서 중심 계산하라고 결과 반환.
  const loadGu = useCallback(async (gu: string): Promise<ShopSummary[]> => {
    setLoading(true);
    try {
      const s = await usecases.catalog.byGu(gu);
      setLoaded(s);
      setError(null);
      return s;
    } catch (e) {
      setError(String(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // 직접 세팅 (이름검색 결과 등)
  const showShops = useCallback((s: ShopSummary[]) => {
    setLoaded(s);
    setLoading(false);
  }, []);

  const searchByName = useCallback((q: string) => usecases.catalog.searchByName(q), []);

  // 필터(분야/가격/시술/혜택) 적용 — 로드된 셋 안에서 클라이언트 필터
  const shops = useMemo(() => loaded.filter((s) => matchesFilter(s, filter)), [loaded, filter]);

  return { shops, loaded, loading, error, filter, setFilter, loadBounds, loadGu, showShops, searchByName };
}
