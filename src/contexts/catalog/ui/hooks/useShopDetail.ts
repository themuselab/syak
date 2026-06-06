import { useEffect, useState } from "react";
import { usecases } from "../../../../app/composition-root";
import type { ShopDetail } from "../../domain/shop";

export function useShopDetail(id: string | null) {
  const [detail, setDetail] = useState<ShopDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    let alive = true;
    setLoading(true);
    usecases.catalog
      .getShopDetail(id)
      .then((d) => alive && setDetail(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  return { detail, loading };
}
