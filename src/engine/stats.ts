import type { Menu, Order } from './types';
import { findOption } from './rules';

// Part F: pure statistics over the orders JSON. The model never computes numbers;
// these functions do, and the model only phrases the returned values.
export const statOrderCount = (orders: Order[]): number => orders.length;
export const statTotalRevenue = (orders: Order[]): number => orders.reduce((s, o) => s + o.total, 0);
export function statBestSellingOption(orders: Order[], menu: Menu): { optionId: string; name: string; units: number } | null {
  const counts = new Map<string, number>();
  for (const o of orders) for (const l of o.lines) for (const sel of Object.values(l.config))
    for (const [optId, q] of Object.entries(sel)) if (q > 0) counts.set(optId, (counts.get(optId) ?? 0) + q * l.qty);
  let best: { optionId: string; name: string; units: number } | null = null;
  for (const [id, units] of counts) { const name = findOption(menu, id)?.option.name ?? id; if (!best || units > best.units) best = { optionId: id, name, units }; }
  return best;
}
export function statRevenueByPaymentMethod(orders: Order[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of orders) out[o.paymentMethod] = (out[o.paymentMethod] ?? 0) + o.total;
  return out;
}
export const statAverageOrderValue = (orders: Order[]): number => (orders.length ? Math.round(orders.reduce((s, o) => s + o.total, 0) / orders.length) : 0);
export const statCouponOrders = (orders: Order[]): Order[] => orders.filter((o) => o.discountCode === 'C2');
export function statOrdersOnDate(orders: Order[], yyyyMmDd: string): Order[] {
  return orders.filter((o) => {
    const d = new Date(o.createdAt + 6 * 3600 * 1000);
    const s = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return s === yyyyMmDd;
  });
}
