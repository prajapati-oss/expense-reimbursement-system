import { BadRequestError } from '../utils/errors';

/**
 * Exchange rates expressed as "1 unit of currency = X units of USD".
 * This is a static in-memory table so the assignment runs fully offline.
 *
 * DESIGN NOTE: this is intentionally isolated behind `getExchangeRate()` /
 * `convert()` so it can be swapped for a real provider (e.g. exchangerate.host,
 * Open Exchange Rates) without touching any calling code - inject a live
 * rate lookup here and everything upstream keeps working. In production this
 * would also be cached with a TTL and rates would be locked at the moment an
 * expense is created (already implemented - see amountBaseCurrency snapshot).
 */
const RATES_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  INR: 0.012,
  JPY: 0.0068,
  AUD: 0.66,
  CAD: 0.73,
  SGD: 0.74,
  AED: 0.27,
  CNY: 0.14,
};

export const SUPPORTED_CURRENCIES = Object.keys(RATES_TO_USD);

function rateToUsd(currency: string): number {
  const rate = RATES_TO_USD[currency.toUpperCase()];
  if (!rate) {
    throw new BadRequestError(
      `Unsupported currency "${currency}". Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`
    );
  }
  return rate;
}

/** Returns the rate such that `amount * rate` converts `from` -> `to`. */
export function getExchangeRate(from: string, to: string): number {
  const fromToUsd = rateToUsd(from);
  const toUsd = rateToUsd(to);
  return fromToUsd / toUsd;
}

export function convert(amount: number, from: string, to: string): number {
  const rate = getExchangeRate(from, to);
  return Math.round(amount * rate * 100) / 100;
}
