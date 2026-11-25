import type { CartPrice, Config, Menu, PriceBreakdown } from './types';
import { findOption } from './rules';
import { configUsage } from './stock';

export const roundHalfUp = (x: number): number => Math.floor(x + 0.5); // for non-negative values
/** Percentage of a poisha amount, rounded half-up to the nearest poisha. */
export const percentPoisha = (amountPoisha: number, pct: number): number => roundHalfUp((amountPoisha * pct) / 100);

export function unitSubtotal(menu: Menu, config: Config): number {
  let sum = menu.basePricePoisha;
  for (const sel of Object.values(config)) for (const [optId, q] of Object.entries(sel)) {
    if (q <= 0) continue;
    const f = findOption(menu, optId); if (f) sum += f.option.pricePoisha * q;
  }
  return sum;
}

export interface PromoConfig { extrasGroupId: string; eggIngredientId: string; proteinGroupId: string; comboEggMin: number; comboProteinMin: number; couponCode: string }
export const PROMOS: PromoConfig = { extrasGroupId: 'extras', eggIngredientId: 'egg', proteinGroupId: 'protein', comboEggMin: 4, comboProteinMin: 2, couponCode: 'MORNING15' };

export function priceLine(menu: Menu, config: Config, qty: number, promos: PromoConfig = PROMOS): PriceBreakdown {
  const unit = unitSubtotal(menu, config);
  // P2: extras deal - every 3 extra units in this config, the cheapest extra unit is free.
  const extrasGroup = menu.groups.find((g) => g.id === promos.extrasGroupId);
  const extraPrices: number[] = [];
  if (extrasGroup) for (const [optId, q] of Object.entries(config[extrasGroup.id] ?? {})) {
    const f = findOption(menu, optId); if (f) for (let i = 0; i < q; i++) extraPrices.push(f.option.pricePoisha);
  }
  const freeCount = Math.floor(extraPrices.length / 3);
  const cheapest = [...extraPrices].sort((a, b) => a - b);
  let p2 = 0; for (let i = 0; i < freeCount; i++) p2 += cheapest[i];
  // P1: combo - 10% off the unit (after P2) when eggs >= 4 and protein >= 2 in this config.
  const usage = configUsage(menu, config);
  const proteinQty = Object.values(config[promos.proteinGroupId] ?? {}).reduce((s, q) => s + q, 0);
  let p1 = 0;
  if ((usage[promos.eggIngredientId] ?? 0) >= promos.comboEggMin && proteinQty >= promos.comboProteinMin) {
    p1 = percentPoisha(unit - p2, 10);
  }
  const lineUnitTotal = unit - p2 - p1;
  return { unitSubtotal: unit, p2Discount: p2, p1Discount: p1, lineUnitTotal, lineTotal: lineUnitTotal * qty };
}

/** Hour/minute of a timestamp in Asia/Dhaka, without depending on the host timezone. */
export function dhakaTime(ms: number): { hour: number; minute: number; second: number } {
  const d = new Date(ms + 6 * 60 * 60 * 1000); // Dhaka is UTC+6, no DST
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() };
}
export function isBefore11Dhaka(ms: number): boolean {
  const t = dhakaTime(ms);
  return t.hour < 11;
}

/** Part C: pure pricing engine. All money is integer poisha. Exact step order per the brief. */
export function priceCart(
  lines: { config: Config; qty: number }[],
  menu: Menu,
  serverTimeMs: number,
  couponCode?: string | null,
  promos: PromoConfig = PROMOS,
): CartPrice {
  const priced = lines.map((l) => priceLine(menu, l.config, l.qty, promos));
  const subtotal = priced.reduce((s, l) => s + l.lineTotal, 0);
  // Cart discounts: C1 = 100 BDT off when subtotal >= 1200 BDT. C2 = MORNING15, 15% capped at 150 BDT, strictly before 11:00 Dhaka.
  const c1 = subtotal >= 120000 ? 10000 : 0;
  let c2 = 0; let couponRejected: string | undefined;
  if (couponCode) {
    if (couponCode !== promos.couponCode) couponRejected = `Coupon ${couponCode} is not valid`;
    else if (!isBefore11Dhaka(serverTimeMs)) couponRejected = 'MORNING15 is only valid before 11:00 AM';
    else c2 = Math.min(percentPoisha(subtotal, 15), 15000);
  }
  let discount = 0; let code: 'C1' | 'C2' | null = null;
  if (c1 > 0 || c2 > 0) { if (c2 > c1) { discount = c2; code = 'C2'; } else { discount = c1; code = 'C1'; } } // tie -> C1
  const discounted = subtotal - discount;
  const vat = percentPoisha(discounted, 5);
  const payable = roundHalfUp((discounted + vat) / 100) * 100; // half-up to whole BDT, in poisha
  return { lines: priced, subtotal, cartDiscount: discount, discountCode: code, couponRejected, vat, payable };
}
export const bdt = (poisha: number): string => (poisha / 100).toFixed(2);
