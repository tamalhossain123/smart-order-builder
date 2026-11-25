import type { Config, Menu, Order } from '../engine/types';
import { priceCart } from '../engine/pricing';
import { configUsage, formatShortages } from '../engine/stock';
import { groupOfOption } from '../engine/rules';

/** Convert a seed line's flat options map ({ toast: 1, scrambled: 2 }) into a grouped Config. */
export function configFromOptions(menu: Menu, options: Record<string, number>): Config {
  const config: Config = {};
  for (const [optId, q] of Object.entries(options)) {
    if (q <= 0) continue;
    const g = groupOfOption(menu, optId);
    if (!g) continue;
    config[g.id] = { ...(config[g.id] ?? {}), [optId]: q };
  }
  return config;
}

/** Normalise any seed shape (bare array, or the real file's { orders: [...] } object) into priced Orders. */
export function normaliseSeed(menu: Menu, raw: any): Order[] {
  const list: any[] = Array.isArray(raw) ? raw : (raw?.orders ?? []);
  return list.map((s) => {
    const createdAt = typeof s.createdAt === 'number' ? s.createdAt : Date.parse(s.createdAt);
    const rawLines: any[] = s.lines ?? [];
    const lines = rawLines.map((l: any) => ({
      config: l.config ?? configFromOptions(menu, l.options ?? {}),
      qty: l.qty,
    }));
    const price = priceCart(lines, menu, createdAt, s.couponCode ?? null);
    return {
      orderId: s.id ?? s.orderId ?? `SEED-${createdAt}`,
      createdAt,
      lines: lines.map((l, i) => ({ config: l.config, qty: l.qty, lineTotal: price.lines[i].lineTotal, unitSubtotal: price.lines[i].unitSubtotal })),
      subtotal: price.subtotal, discount: price.cartDiscount, discountCode: price.discountCode,
      vat: price.vat, total: price.payable, paymentMethod: s.paymentMethod ?? 'cash', couponCode: s.couponCode ?? null,
    } as Order;
  });
}

// Simulated server store. The brief's mock architecture has no real backend, so the
// "server" lives behind MSW and persists in localStorage; all server rules (stock,
// reservation expiry, idempotency, server clock +90s) are enforced HERE, not in the UI.
export const SERVER_OFFSET_MS = 90_000;
export const RESERVATION_MS = 5 * 60_000;
const KEY = 'sob.server.v2';
export const serverNow = (): number => Date.now() + SERVER_OFFSET_MS;

interface Db { orders: Order[]; reservations: Record<string, { usage: Record<string, number>; expiresAt: number }>; checkoutKeys: Record<string, string>; reserveKeys: Record<string, string>; seeded: boolean }
function load(): Db {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return { orders: [], reservations: {}, checkoutKeys: {}, reserveKeys: {}, seeded: false };
}
function save(db: Db) { localStorage.setItem(KEY, JSON.stringify(db)); }
export function resetDb() { localStorage.removeItem(KEY); }

function purgeExpired(db: Db) {
  const now = serverNow();
  for (const [id, r] of Object.entries(db.reservations)) if (r.expiresAt <= now) delete db.reservations[id];
}
function usedIngredients(db: Db, menu: Menu, excludeLineId?: string): Record<string, number> {
  purgeExpired(db);
  const use: Record<string, number> = {};
  // Only ACTIVE reservations hold stock. Stored orders (including the seed orders)
  // are historical sales records for Parts E/F stats; they must not eat today's
  // stock, otherwise the seed data alone exceeds the egg stock and nothing can
  // ever be added (TC-08 measures remaining stock from the cart, from full stock).
  for (const [id, r] of Object.entries(db.reservations)) { if (id === excludeLineId) continue; for (const [k, v] of Object.entries(r.usage)) use[k] = (use[k] ?? 0) + v; }
  return use;
}
export function checkStock(db: Db, menu: Menu, usage: Record<string, number>, excludeLineId?: string) {
  const used = usedIngredients(db, menu, excludeLineId);
  const short: { ingredientId: string; name: string; short: number }[] = [];
  for (const [ing, amt] of Object.entries(usage)) {
    if (amt <= 0) continue;
    const stock = menu.stock[ing]; if (stock === null || stock === undefined) continue;
    const free = stock - (used[ing] ?? 0);
    if (amt > free) short.push({ ingredientId: ing, name: menu.ingredientNames[ing] ?? ing, short: amt - free });
  }
  return short;
}

export function reserve(menu: Menu, lineId: string, usage: Record<string, number>, idempotencyKey: string) {
  const db = load();
  if (db.reserveKeys[idempotencyKey]) return { ok: true as const, lineId: db.reserveKeys[idempotencyKey], expiresAt: db.reservations[db.reserveKeys[idempotencyKey]]?.expiresAt ?? serverNow() + RESERVATION_MS, duplicate: true };
  const short = checkStock(db, menu, usage);
  if (short.length) return { ok: false as const, error: formatShortages(short), shortages: short };
  const expiresAt = serverNow() + RESERVATION_MS;
  db.reservations[lineId] = { usage, expiresAt };
  db.reserveKeys[idempotencyKey] = lineId;
  save(db);
  return { ok: true as const, lineId, expiresAt, duplicate: false };
}

export function editReservation(menu: Menu, lineId: string, newUsage: Record<string, number>) {
  const db = load();
  if (!db.reservations[lineId]) return { ok: false as const, error: 'Reservation expired or missing' };
  if (db.reservations[lineId].expiresAt <= serverNow()) { delete db.reservations[lineId]; save(db); return { ok: false as const, error: 'Reservation expired' }; }
  const short = checkStock(db, menu, newUsage, lineId); // own allocation counts as available
  if (short.length) return { ok: false as const, error: formatShortages(short), shortages: short }; // old reservation untouched (atomic)
  db.reservations[lineId] = { usage: newUsage, expiresAt: serverNow() + RESERVATION_MS };
  save(db);
  return { ok: true as const, expiresAt: db.reservations[lineId].expiresAt };
}

export function release(lineId: string) { const db = load(); delete db.reservations[lineId]; save(db); }

export function checkout(menu: Menu, idempotencyKey: string, lines: { lineId: string; config: Order['lines'][number]['config']; qty: number }[], paymentMethod: string, couponCode?: string | null) {
  const db = load();
  if (db.checkoutKeys[idempotencyKey]) { const existing = db.orders.find((o) => o.orderId === db.checkoutKeys[idempotencyKey]); if (existing) return { ok: true as const, order: existing, duplicate: true }; }
  const now = serverNow();
  for (const l of lines) { const r = db.reservations[l.lineId]; if (!r || r.expiresAt <= now) return { ok: false as const, error: 'A cart item has expired. Remove it and try again.' }; }
  const price = priceCart(lines, menu, now, couponCode);
  const order: Order = {
    orderId: `ORD-${now}-${Math.floor(Math.random() * 1e6)}`, createdAt: now,
    lines: lines.map((l, i) => ({ config: l.config, qty: l.qty, lineTotal: price.lines[i].lineTotal, unitSubtotal: price.lines[i].unitSubtotal })),
    subtotal: price.subtotal, discount: price.cartDiscount, discountCode: price.discountCode,
    vat: price.vat, total: price.payable, paymentMethod, couponCode: couponCode ?? null,
  };
  db.orders.push(order);
  for (const l of lines) delete db.reservations[l.lineId];
  db.checkoutKeys[idempotencyKey] = order.orderId;
  save(db);
  return { ok: true as const, order, duplicate: false };
}

export function listOrders(): Order[] { return load().orders; }

/** Seed orders are priced with our own engine at each order's createdAt and its own couponCode (brief Part E). */
export function seedIfNeeded(menu: Menu, seed: any) {
  const db = load();
  if (db.seeded) return;
  db.seeded = true;
  for (const o of normaliseSeed(menu, seed)) db.orders.push(o);
  save(db);
}
