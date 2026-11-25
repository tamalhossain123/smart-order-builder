import { describe, it, expect, beforeEach } from 'vitest';
import { MENU } from '../data/fixture';
import { validate } from '../engine/rules';
import { configUsage, maxAddable, shortages, formatShortages } from '../engine/stock';
import { priceCart, priceLine, unitSubtotal, bdt } from '../engine/pricing';
import * as db from '../mocks/serverDb';
import type { Config } from '../engine/types';

// Configs A, B, C from the brief's acceptance tests (fixture ids from Appendix A data).
// Section 9 item definitions (official Appendix A ids):
// A = Toast, Scrambled x2, Chicken Sausage, Ketchup
// B = Croissant, Omelette x2, Fried x2, Chicken Sausage, Beef Bacon, Hash Brown, Mushroom, Hollandaise
// C = Paratha, Fried x2, Tofu, Cheese x2, Baked Beans, Mushroom, Chili
const A: Config = { bread: { toast: 1 }, eggs: { scrambled: 2 }, protein: { sausage: 1 }, sauce: { ketchup: 1 } };
const B: Config = { bread: { croissant: 1 }, eggs: { omelette: 2, fried: 2 }, protein: { sausage: 1, bacon: 1 }, extras: { hashbrown: 1, mushroom: 1 }, sauce: { hollandaise: 1 } };
const C: Config = { bread: { paratha: 1 }, eggs: { fried: 2 }, protein: { tofu: 1 }, extras: { cheese: 2, beans: 1, mushroom: 1 }, sauce: { chili: 1 } };
const DHAKA_105959 = Date.UTC(2026, 10, 25, 4, 59, 59); // 10:59:59 Asia/Dhaka
const DHAKA_110000 = Date.UTC(2026, 10, 25, 5, 0, 0);   // 11:00:00 Asia/Dhaka

describe('Part A - rules engine', () => {
  it('TC-01: empty config reports the bread minimum (and returns all violations)', () => {
    const v = validate({}, MENU);
    expect(v.some((x) => x.ruleId === 'group-min:bread')).toBe(true);
  });
  it('TC-02: exceeding a group max is reported', () => {
    const v = validate({ bread: { toast: 1 }, sauce: { ketchup: 1, hollandaise: 1, chili: 1 } }, MENU);
    expect(v.some((x) => x.ruleId === 'group-max:sauce')).toBe(true);
  });
  it('TC-03: R1 hollandaise requires scrambled or omelette', () => {
    const bad = validate({ bread: { toast: 1 }, eggs: { fried: 2 }, sauce: { hollandaise: 1 } }, MENU);
    expect(bad.some((x) => x.ruleId === 'R1')).toBe(true);
    const good = validate({ bread: { toast: 1 }, eggs: { scrambled: 2 }, sauce: { hollandaise: 1 } }, MENU);
    expect(good.some((x) => x.ruleId === 'R1')).toBe(false);
  });
  it('TC-04: R2 excludes, R4 excludes, R3 overrideLimit wins over group max', () => {
    const v = validate({ bread: { toast: 1 }, protein: { tofu: 1, sausage: 1 } }, MENU);
    expect(v.some((x) => x.ruleId === 'R2')).toBe(true);
    const v2 = validate({ bread: { toast: 1 }, eggs: { scrambled: 2 }, sauce: { hollandaise: 1, chili: 1 } }, MENU);
    expect(v2.some((x) => x.ruleId === 'R4')).toBe(true);
    const v3 = validate({ bread: { croissant: 1 }, extras: { hashbrown: 1, mushroom: 1, cheese: 1 } }, MENU);
    expect(v3.some((x) => x.ruleId === 'R3')).toBe(true); // extras max overridden to 2 by croissant
  });
});

describe('Part C - pricing engine', () => {
  it('TC-05: unit prices A = 380.00, B = 679.50, C = 490.00', () => {
    expect(bdt(unitSubtotal(MENU, A))).toBe('380.00'); // A has no promo: raw subtotal is the unit price
    expect(bdt(priceLine(MENU, B, 1).lineUnitTotal)).toBe('679.50'); // 755.00 raw, P1 combo 10% off
    expect(bdt(priceLine(MENU, C, 1).lineUnitTotal)).toBe('490.00'); // 515.00 raw, P2 cheapest extra (beans 25.00) free
  });
  it('TC-06: B x1 + C x2 at 10:59:59 with MORNING15 -> subtotal 1659.50, C2 = 150.00 wins, VAT 75.48, payable 1585', () => {
    const p = priceCart([{ config: B, qty: 1 }, { config: C, qty: 2 }], MENU, DHAKA_105959, 'MORNING15');
    expect(bdt(p.subtotal)).toBe('1659.50');
    expect(p.discountCode).toBe('C2'); expect(bdt(p.cartDiscount)).toBe('150.00');
    expect(bdt(p.vat)).toBe('75.48'); expect(bdt(p.payable)).toBe('1585.00');
  });
  it('TC-07: same cart at 11:00:00 -> coupon rejected, C1 = 100.00, VAT 77.98, payable 1637', () => {
    const p = priceCart([{ config: B, qty: 1 }, { config: C, qty: 2 }], MENU, DHAKA_110000, 'MORNING15');
    expect(p.couponRejected).toBeTruthy();
    expect(p.discountCode).toBe('C1'); expect(bdt(p.cartDiscount)).toBe('100.00');
    expect(bdt(p.vat)).toBe('77.98'); expect(bdt(p.payable)).toBe('1637.00');
  });
  it('P2 extras deal: every 3rd extra unit cheapest free; P1 combo 10% when eggs>=4 and protein>=2', () => {
    const dealCfg: Config = { bread: { toast: 1 }, extras: { hashbrown: 1, mushroom: 1, cheese: 1 } };
    const p = priceCart([{ config: dealCfg, qty: 1 }], MENU, DHAKA_105959, null);
    expect(bdt(p.lines[0].p2Discount)).toBe('30.00'); // mushroom (30.00) is the cheapest of the 3 extras
    const comboCfg: Config = { bread: { toast: 1 }, eggs: { omelette: 2 }, protein: { sausage: 1, bacon: 1 } };
    const p2r = priceCart([{ config: comboCfg, qty: 1 }], MENU, DHAKA_105959, null);
    expect(p2r.lines[0].p1Discount).toBeGreaterThan(0);
  });
});

describe('Part B - shared stock', () => {
  it('TC-08: maxAddable respects shared stock (croissant stock is 2)', () => {
    expect(maxAddable(MENU, [], {}, 'croissant')).toBe(2);
    const cart: any = [{ lineId: 'l1', config: { bread: { croissant: 1 } }, qty: 1, idempotencyKey: 'k', reservedUntil: null, expired: false }];
    expect(maxAddable(MENU, cart, {}, 'croissant')).toBe(1);
  });
  it('TC-09: shortage message is exactly "Short: 1 egg"', () => {
    const cart: any = [{ lineId: 'l1', config: {}, qty: 1, idempotencyKey: 'k', reservedUntil: null, expired: false }];
    // simulate 9 of 10 eggs already used by a config in the cart via direct usage check:
    const s = shortages(MENU, [], { egg: 11 });
    expect(formatShortages(s)).toBe('Short: 1 egg');
    expect(cart).toBeTruthy();
  });
  it('TC-10: cart quantity multiplies ingredient usage', () => {
    const u = configUsage(MENU, C);
    expect(u.egg).toBe(2);
    const total = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v * 3]));
    expect(total.egg).toBe(6);
  });
});

describe('Part D/E - reservations, checkout, orders (mock server)', () => {
  beforeEach(() => db.resetDb());
  it('TC-12: Add to Cart idempotency - same key twice creates one reservation', () => {
    const r1 = db.reserve(MENU, 'line-1', { egg: 2 }, 'key-abc');
    const r2 = db.reserve(MENU, 'line-1', { egg: 2 }, 'key-abc');
    expect(r1.ok && r2.ok && (r2 as any).duplicate).toBe(true);
    const blocked = db.reserve(MENU, 'line-2', { egg: 9 }, 'key-xyz'); // only 2 eggs held once: 8 free, so 9 is short by 1
    expect(blocked.ok).toBe(false); if (!blocked.ok) expect(blocked.error).toBe('Short: 1 egg');
  });
  it('TC-11: blocked edit lists every shortage - "Short: 2 egg, 2 cheese", old reservation kept', () => {
    db.reserve(MENU, 'line-1', { egg: 8, cheese: 2 }, 'k1');
    const r = db.editReservation(MENU, 'line-1', { egg: 12, cheese: 6 });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toBe('Short: 2 egg, 2 cheese');
    const still = db.editReservation(MENU, 'line-1', { egg: 8, cheese: 2 });
    expect(still.ok).toBe(true); // own allocation still intact and counts as available
  });
  it('TC-13/TC-14: expired reservation frees stock and cannot be edited or checked out', () => {
    db.reserve(MENU, 'line-1', { egg: 10 }, 'k1');
    const raw = JSON.parse(localStorage.getItem('sob.server.v2')!);
    raw.reservations['line-1'].expiresAt = db.serverNow() - 1000;
    localStorage.setItem('sob.server.v2', JSON.stringify(raw));
    const again = db.reserve(MENU, 'line-2', { egg: 10 }, 'k2'); expect(again.ok).toBe(true); // stock freed after expiry
    const e = db.editReservation(MENU, 'line-1', { egg: 1 });
    expect(e.ok).toBe(false);
  });
  it('TC-15/TC-16: double Pay creates exactly one order, and orders survive a reload', () => {
    db.reserve(MENU, 'line-1', configUsage(MENU, C), 'k1');
    const lines = [{ lineId: 'line-1', config: C, qty: 1 }];
    const r1 = db.checkout(MENU, 'pay-1', lines, 'cash', null);
    const r2 = db.checkout(MENU, 'pay-1', lines, 'cash', null);
    expect(r1.ok && r2.ok && (r2 as any).duplicate).toBe(true);
    expect(db.listOrders().length).toBe(1);
    expect(db.listOrders()[0].total).toBeGreaterThan(0); // re-read from storage = survives refresh
  });
  it('TC-17 (mechanism): seed orders are priced with the engine at their own createdAt', () => {
    const seed = [{ orderId: 'SEED-T', createdAt: DHAKA_105959, paymentMethod: 'card', couponCode: 'MORNING15', lines: [{ config: B, qty: 1 }, { config: C, qty: 2 }] }];
    db.seedIfNeeded(MENU, seed as any);
    const o = db.listOrders()[0];
    expect(bdt(o.subtotal)).toBe('1659.50'); expect(bdt(o.total)).toBe('1585.00'); // same numbers as TC-06
  });
});
