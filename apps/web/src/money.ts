export type Lang = "ru" | "kk" | "en";

const NBSP = " ";
const MINUS = "−";

/**
 * "3 315 ₸": digits grouped in threes with U+00A0, then U+00A0 and ₸.
 * Hand-rolled rather than Intl so every browser renders the same characters.
 * The format is the same in all supported languages; `lang` keeps the call sites explicit.
 */
export function formatMoney(n: number, lang: Lang): string {
  void lang;
  const rounded = Math.round(n);
  const digits = String(Math.abs(rounded));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${rounded < 0 ? MINUS : ""}${grouped}${NBSP}₸`;
}
