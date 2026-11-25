import type { CartLine, Config, Menu } from './types';
import { findOption } from './rules';

/** Ingredient usage of one config (one unit, before cart qty). */
export function configUsage(menu: Menu, config: Config): Record<string, number> {
  const use: Record<string, number> = {};
  for (const sel of Object.values(config)) for (const [optId, q] of Object.entries(sel)) {
    if (q <= 0) continue;
    const f = findOption(menu, optId); if (!f) continue;
    for (const ing of f.option.ingredients) use[ing.ingredientId] = (use[ing.ingredientId] ?? 0) + ing.amount * q;
  }
  return use;
}
/** Total reserved usage across cart lines (qty multiplies usage). excludeLineId: that line's own allocation counts as available (edit). */
export function reservedUsage(menu: Menu, cart: CartLine[], excludeLineId?: string): Record<string, number> {
  const use: Record<string, number> = {};
  for (const line of cart) {
    if (line.expired || line.lineId === excludeLineId) continue;
    const u = configUsage(menu, line.config);
    for (const [k, v] of Object.entries(u)) use[k] = (use[k] ?? 0) + v * line.qty;
  }
  return use;
}
export function available(menu: Menu, cart: CartLine[], ingredientId: string, excludeLineId?: string): number | null {
  const stock = menu.stock[ingredientId];
  if (stock === null || stock === undefined) return null; // unlimited
  return stock - (reservedUsage(menu, cart, excludeLineId)[ingredientId] ?? 0);
}
/** How many more units of an option can be added to the current config, given shared stock. */
export function maxAddable(menu: Menu, cart: CartLine[], currentConfig: Config, optionId: string, excludeLineId?: string): number {
  const f = findOption(menu, optionId); if (!f) return 0;
  const inConfig = configUsage(menu, currentConfig);
  let max = Infinity;
  for (const ing of f.option.ingredients) {
    const stock = menu.stock[ing.ingredientId];
    if (stock === null || stock === undefined) continue;
    const reserved = reservedUsage(menu, cart, excludeLineId)[ing.ingredientId] ?? 0;
    const remaining = stock - reserved - (inConfig[ing.ingredientId] ?? 0);
    max = Math.min(max, Math.floor(remaining / ing.amount));
  }
  return max === Infinity ? Number.MAX_SAFE_INTEGER : Math.max(0, max);
}
/** Check a candidate usage delta against stock; returns every shortage with exact amounts. */
export function shortages(menu: Menu, cart: CartLine[], usageDelta: Record<string, number>, excludeLineId?: string): { ingredientId: string; name: string; short: number }[] {
  const out: { ingredientId: string; name: string; short: number }[] = [];
  const reserved = reservedUsage(menu, cart, excludeLineId);
  for (const [ing, amt] of Object.entries(usageDelta)) {
    if (amt <= 0) continue;
    const stock = menu.stock[ing];
    if (stock === null || stock === undefined) continue;
    const free = stock - (reserved[ing] ?? 0);
    if (amt > free) out.push({ ingredientId: ing, name: menu.ingredientNames[ing] ?? ing, short: amt - free });
  }
  return out;
}
export function formatShortages(list: { name: string; short: number }[]): string {
  return 'Short: ' + list.map((s) => `${s.short} ${s.name}`).join(', ');
}
