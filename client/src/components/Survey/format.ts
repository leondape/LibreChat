import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const COMPACT_FROM = 10000;

/** Whole numbers stay readable; large ones (tokens) shorten to "1.2M". */
export default function useFormatNumber() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const plain = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
    const compact = new Intl.NumberFormat(i18n.language, {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    return (value: number) => (Math.abs(value) >= COMPACT_FROM ? compact : plain).format(value);
  }, [i18n.language]);
}
