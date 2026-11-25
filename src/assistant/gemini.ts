import type { Menu, Order } from '../engine/types';
import * as stats from '../engine/stats';
import { bdt } from '../engine/pricing';

// Part F: Gemini sales assistant. The model gets function declarations only - never the
// raw orders. Every number in an answer is computed by the pure stats functions below
// and returned to the model as a function result; the model only phrases it.
export const TOOL_DEFS = [
  { name: 'getOrderCount', description: 'Total number of orders', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'getTotalRevenue', description: 'Total revenue in BDT', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'getBestSellingOption', description: 'Best selling menu option by units sold', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'getRevenueByPaymentMethod', description: 'Revenue split by payment method', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'getAverageOrderValue', description: 'Average order value in BDT', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'getCouponOrders', description: 'Orders that received the MORNING15 coupon discount', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'getOrdersOnDate', description: 'Orders placed on a date (Asia/Dhaka)', parameters: { type: 'OBJECT', properties: { date: { type: 'STRING', description: 'YYYY-MM-DD' } }, required: ['date'] } },
];

export function runTool(name: string, args: any, orders: Order[], menu: Menu): any {
  switch (name) {
    case 'getOrderCount': return { orderCount: stats.statOrderCount(orders) };
    case 'getTotalRevenue': return { totalRevenueBDT: Number(bdt(stats.statTotalRevenue(orders))) };
    case 'getBestSellingOption': { const b = stats.statBestSellingOption(orders, menu); return b ? { option: b.name, unitsSold: b.units } : { option: null, note: 'No orders yet' }; }
    case 'getRevenueByPaymentMethod': { const r = stats.statRevenueByPaymentMethod(orders); const out: Record<string, number> = {}; for (const [k, v] of Object.entries(r)) out[k] = Number(bdt(v)); return { revenueByPaymentMethodBDT: out }; }
    case 'getAverageOrderValue': return { averageOrderValueBDT: Number(bdt(stats.statAverageOrderValue(orders))) };
    case 'getCouponOrders': { const list = stats.statCouponOrders(orders); return { count: list.length, orderIds: list.map((o) => o.orderId) }; }
    case 'getOrdersOnDate': { const list = stats.statOrdersOnDate(orders, String(args?.date ?? '')); return { date: args?.date, count: list.length, revenueBDT: Number(bdt(list.reduce((s, o) => s + o.total, 0))) }; }
    default: return { error: `Unknown tool ${name}` };
  }
}

export class AssistantError extends Error { constructor(public kind: 'missing-key' | 'invalid-key' | 'quota' | 'network' | 'other', message: string) { super(message); } }

export async function askAssistant(question: string, orders: Order[], menu: Menu, apiKey: string | undefined, fetchFn: typeof fetch = fetch): Promise<string> {
  if (!apiKey) throw new AssistantError('missing-key', 'Gemini API key is not set. Add VITE_GEMINI_API_KEY to .env.local and restart the dev server.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const contents: any[] = [{ role: 'user', parts: [{ text: question }] }];
  try {
    for (let turn = 0; turn < 5; turn++) {
      const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'You are a sales assistant for a breakfast shop. Answer ONLY using the provided tools. Never invent numbers. If a question cannot be answered from order data (for example who the best customer is - orders have no customer identity), say honestly that you cannot know that from the data.' }] },
        contents, tools: [{ functionDeclarations: TOOL_DEFS }],
      }) });
      if (res.status === 400 || res.status === 403) throw new AssistantError('invalid-key', 'The Gemini API key was rejected. Check the key in .env.local.');
      if (res.status === 429) throw new AssistantError('quota', 'Gemini free-tier quota is exhausted (429). Please wait and try again.');
      if (!res.ok) throw new AssistantError('other', `Gemini request failed (${res.status}).`);
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p: any) => p.functionCall);
      if (!calls.length) return parts.map((p: any) => p.text ?? '').join('').trim() || 'I could not answer that from the order data.';
      contents.push({ role: 'model', parts });
      contents.push({ role: 'user', parts: calls.map((p: any) => ({ functionResponse: { name: p.functionCall.name, response: runTool(p.functionCall.name, p.functionCall.args ?? {}, orders, menu) } })) });
    }
    return 'I could not finish answering that. Please try a simpler question.';
  } catch (e) {
    if (e instanceof AssistantError) throw e;
    throw new AssistantError('network', 'Network error while contacting Gemini. Check your connection and try again.');
  }
}
