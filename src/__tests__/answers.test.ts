import { it, expect } from 'vitest';
import { MENU } from '../data/fixture';
import seedRaw from '../data/orders.seed.json';
import { priceCart, priceLine, bdt } from '../engine/pricing';
import { validate } from '../engine/rules';
import { configUsage } from '../engine/stock';
import * as stats from '../engine/stats';
import { normaliseSeed } from '../mocks/serverDb';
import type { Config } from '../engine/types';

// Section 9 item definitions (official Appendix A ids).
const A: Config = { bread: { toast: 1 }, eggs: { scrambled: 2 }, protein: { sausage: 1 }, sauce: { ketchup: 1 } };
const B: Config = { bread: { croissant: 1 }, eggs: { omelette: 2, fried: 2 }, protein: { sausage: 1, bacon: 1 }, extras: { hashbrown: 1, mushroom: 1 }, sauce: { hollandaise: 1 } };
const C: Config = { bread: { paratha: 1 }, eggs: { fried: 2 }, protein: { tofu: 1 }, extras: { cheese: 2, beans: 1, mushroom: 1 }, sauce: { chili: 1 } };
const B_EDITED: Config = { bread: { croissant: 1 }, eggs: { omelette: 2, fried: 2 }, protein: { sausage: 1, bacon: 1 }, extras: { mushroom: 1 }, sauce: { hollandaise: 1 } }; // B after the TC-10 edit (hash brown removed)
const DHAKA = (h: number, m: number, s = 0) => Date.UTC(2026, 10, 25, h - 6, m, s); // Asia/Dhaka = UTC+6

it('prints and verifies ANSWERS.md Q1-Q8 by running the real engines', () => {
  // Sanity: Section 9 unit prices (TC-05).
  expect(bdt(priceLine(MENU, A, 1).lineUnitTotal)).toBe('380.00');
  expect(bdt(priceLine(MENU, B, 1).lineUnitTotal)).toBe('679.50');
  expect(bdt(priceLine(MENU, C, 1).lineUnitTotal)).toBe('490.00');

  // Q1: max number of C from an empty cart, and the limiting ingredient.
  const usageC = configUsage(MENU, C);
  let maxC = Infinity; let limiter = '';
  for (const [ing, amt] of Object.entries(usageC)) {
    const stock = MENU.stock[ing];
    if (stock === null || stock === undefined) continue;
    const n = Math.floor(stock / amt);
    if (n < maxC) { maxC = n; limiter = ing; }
  }
  console.log('Q1 max C:', maxC, 'limited by', limiter, '(per-C usage:', JSON.stringify(usageC), ')');
  expect(maxC).toBe(2); expect(limiter).toBe('cheese');

  // Q2: cheapest valid configuration. Extras/sauce can never lower the price
  // (every extra costs more than the P2 free one gives back, and the cheapest
  // sauce is free), so I search bread x eggs x protein with the real validator
  // and pricing engine; the winner is then priced in full.
  let best: { config: Config; price: number } | null = null;
  const breads: Config[] = MENU.groups[0].options.map((o) => ({ bread: { [o.id]: 1 } }));
  const eggOpts = MENU.groups[1].options.map((o) => o.id);
  const protOpts = MENU.groups[2].options.map((o) => o.id);
  for (const b of breads)
    for (let e1 = 0; e1 <= 6; e1++) for (let e2 = 0; e2 <= 6; e2++) for (let e3 = 0; e3 <= 6; e3++)
      for (let p1 = 0; p1 <= 3; p1++) for (let p2 = 0; p2 <= 3; p2++) for (let p3 = 0; p3 <= 3; p3++) {
        const eggs: Record<string, number> = {}; [e1, e2, e3].forEach((q, i) => { if (q) eggs[eggOpts[i]] = q; });
        const protein: Record<string, number> = {}; [p1, p2, p3].forEach((q, i) => { if (q) protein[protOpts[i]] = q; });
        const cfg: Config = { ...b, eggs, protein };
        if (validate(cfg, MENU).length) continue;
        const price = priceLine(MENU, cfg, 1).lineUnitTotal;
        if (!best || price < best.price) best = { config: cfg, price };
      }
  console.log('Q2 cheapest valid:', JSON.stringify(best!.config), bdt(best!.price));
  expect(bdt(best!.price)).toBe('360.00');
  expect(best!.config).toEqual({ bread: { toast: 1 }, eggs: { fried: 2 }, protein: { tofu: 1 } });

  // Q3: A x3 with MORNING15 entered, at 10:30 and at 11:30, plus no-coupon figures.
  const q3a = priceCart([{ config: A, qty: 3 }], MENU, DHAKA(10, 30), 'MORNING15');
  console.log('Q3 10:30 with coupon:', bdt(q3a.subtotal), q3a.discountCode, bdt(q3a.cartDiscount), bdt(q3a.vat), bdt(q3a.payable));
  expect([bdt(q3a.subtotal), q3a.discountCode, bdt(q3a.cartDiscount), bdt(q3a.vat), bdt(q3a.payable)]).toEqual(['1140.00', 'C2', '150.00', '49.50', '1040.00']);
  const q3b = priceCart([{ config: A, qty: 3 }], MENU, DHAKA(11, 30), 'MORNING15');
  console.log('Q3 11:30 with coupon:', bdt(q3b.subtotal), q3b.discountCode, bdt(q3b.cartDiscount), bdt(q3b.vat), bdt(q3b.payable), q3b.couponRejected);
  expect([bdt(q3b.subtotal), q3b.discountCode, bdt(q3b.cartDiscount), bdt(q3b.vat), bdt(q3b.payable)]).toEqual(['1140.00', null, '0.00', '57.00', '1197.00']);
  const q3nc = priceCart([{ config: A, qty: 3 }], MENU, DHAKA(10, 30), null);
  console.log('Q3 no coupon (either time):', bdt(q3nc.subtotal), bdt(q3nc.cartDiscount), bdt(q3nc.vat), bdt(q3nc.payable));
  expect([bdt(q3nc.cartDiscount), bdt(q3nc.vat), bdt(q3nc.payable)]).toEqual(['0.00', '57.00', '1197.00']);

  // Q4: after TC-10 (edited B = 643.50, plus C x2), payable at 11:30.
  expect(bdt(priceLine(MENU, B_EDITED, 1).lineUnitTotal)).toBe('643.50');
  const q4 = priceCart([{ config: B_EDITED, qty: 1 }, { config: C, qty: 2 }], MENU, DHAKA(11, 30), 'MORNING15');
  console.log('Q4:', bdt(q4.subtotal), q4.discountCode, bdt(q4.cartDiscount), bdt(q4.vat), bdt(q4.payable));
  expect([bdt(q4.subtotal), q4.discountCode, bdt(q4.cartDiscount), bdt(q4.vat), bdt(q4.payable)]).toEqual(['1623.50', 'C1', '100.00', '76.18', '1600.00']);

  // Q5-Q8: the real seed orders, priced by the engine at each order's createdAt with its own couponCode.
  const orders = normaliseSeed(MENU, seedRaw as any);
  for (const o of orders) console.log('Q5', o.orderId, 'subtotal', bdt(o.subtotal), 'discount', bdt(o.discount), o.discountCode, 'vat', bdt(o.vat), 'payable', bdt(o.total), o.paymentMethod, 'coupon', o.couponCode);
  console.log('Q5 total revenue:', bdt(stats.statTotalRevenue(orders)));
  expect(orders.map((o) => bdt(o.total))).toEqual(['339.00', '713.00', '1271.00', '578.00', '866.00', '1228.00']);
  expect(bdt(stats.statTotalRevenue(orders))).toBe('4995.00');

  const bestSeller = stats.statBestSellingOption(orders, MENU);
  console.log('Q6 best-selling option:', bestSeller?.optionId, bestSeller?.units);
  expect(bestSeller?.optionId).toBe('fried'); expect(bestSeller?.units).toBe(10);

  const byMethod = stats.statRevenueByPaymentMethod(orders);
  console.log('Q7 revenue by payment method:', Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, bdt(v)])));
  expect(bdt(byMethod.card)).toBe('2145.00');
  expect(Math.max(...Object.values(byMethod))).toBe(byMethod.card);

  const couponOrders = stats.statCouponOrders(orders);
  console.log('Q8 orders that received MORNING15 (C2):', couponOrders.map((o) => o.orderId));
  expect(couponOrders.map((o) => o.orderId)).toEqual(['ORD-1001', 'ORD-1003', 'ORD-1005']);
  const o1006 = orders.find((o) => o.orderId === 'ORD-1006')!;
  expect(o1006.couponCode).toBe('MORNING15'); expect(o1006.discountCode).toBe(null); // entered, but createdAt 13:10 is after the 11:00 cutoff
});
