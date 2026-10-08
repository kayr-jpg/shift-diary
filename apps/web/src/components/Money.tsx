import { useTranslation } from "react-i18next";
import { formatMoney } from "../money";
import { currentLang } from "../i18n";

/** A formatted tenge amount. Kept tiny so an animated count-up can wrap or replace it. */
export function Money({ value, className, testId }: { value: number; className?: string; testId?: string }) {
  useTranslation(); // re-render on language change
  return (
    <span className={`tabular-nums whitespace-nowrap ${className ?? ""}`} data-testid={testId}>
      {formatMoney(value, currentLang())}
    </span>
  );
}
