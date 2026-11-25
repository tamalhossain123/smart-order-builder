import { describe, it, expect, vi } from 'vitest';
import { MENU } from '../data/fixture';
import * as stats from '../engine/stats';
import { runTool, askAssistant, AssistantError } from '../assistant/gemini';
import type { Order } from '../engine/types';

const orders: Order[] = [
  { orderId: 'O1', createdAt: Date.UTC(2026, 10, 25, 4, 0, 0), lines: [{ config: { bread: { toast: 1 }, eggs: { scrambled: 1 } }, qty: 1, lineTotal: 31000, unitSubtotal: 31000 }], subtotal: 31000, discount: 0, discountCode: null, vat: 1550, total: 32550, paymentMethod: 'cash', couponCode: null },
  { orderId: 'O2', createdAt: Date.UTC(2026, 10, 25, 5, 0, 0), lines: [{ config: { bread: { toast: 1 }, eggs: { scrambled: 2 } }, qty: 2, lineTotal: 74000, unitSubtotal: 37000 }], subtotal: 74000, discount: 15000, discountCode: 'C2', vat: 2950, total: 61950, paymentMethod: 'bkash', couponCode: 'MORNING15' },
];
describe('Part F - assistant stats (pure functions, model never computes)', () => {
  it('TC-18: order count, revenue, AOV, revenue by payment method', () => {
    expect(stats.statOrderCount(orders)).toBe(2);
    expect(stats.statTotalRevenue(orders)).toBe(94500);
    expect(stats.statRevenueByPaymentMethod(orders)).toEqual({ cash: 32550, bkash: 61950 });
    expect(stats.statAverageOrderValue(orders)).toBe(47250);
  });
  it('TC-19: best-selling option by units and coupon orders', () => {
    const best = stats.statBestSellingOption(orders, MENU);
    expect(best?.optionId).toBe('scrambled'); expect(best?.units).toBe(5);
    expect(stats.statCouponOrders(orders).map((o) => o.orderId)).toEqual(['O2']);
    expect(runTool('getOrdersOnDate', { date: '2026-11-25' }, orders, MENU).count).toBe(2);
  });
  it('TC-20: Gemini function calling is mocked; tool result carries the number, missing key errors clearly', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name: 'getOrderCount', args: {} } }] } }] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'There are 2 orders.' }] } }] }) });
    const a = await askAssistant('How many orders?', orders, MENU, 'test-key', fetchFn as any);
    expect(a).toBe('There are 2 orders.');
    const secondCallBody = JSON.parse(fetchFn.mock.calls[1][1].body);
    const fnResp = secondCallBody.contents.at(-1).parts[0].functionResponse;
    expect(fnResp.response.orderCount).toBe(2); // number came from our stats function, not the model
    await expect(askAssistant('How many orders?', orders, MENU, undefined, fetchFn as any)).rejects.toBeInstanceOf(AssistantError);
  });
});
