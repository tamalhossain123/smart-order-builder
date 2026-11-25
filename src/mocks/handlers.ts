import { http, HttpResponse } from 'msw';
import { MENU } from '../data/fixture';
import seedData from '../data/orders.seed.json';
import * as db from './serverDb';
import { priceCart } from '../engine/pricing';
import { configUsage } from '../engine/stock';

const json = (body: any, status = 200) => HttpResponse.json({ ...body, serverTime: db.serverNow() }, { status });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const handlers = [
  http.get('/api/menu', () => { db.seedIfNeeded(MENU, seedData as any); return json({ menu: MENU }); }),
  http.get('/api/time', () => json({})),
  http.post('/api/price', async ({ request }) => {
    await delay(200 + Math.random() * 1300); // 200-1500ms latency per brief
    if (Math.random() < 0.15) return json({ error: 'Price service failed, please retry' }, 500); // 15% random failure
    const body = (await request.json()) as any;
    const price = priceCart(body.lines, MENU, db.serverNow(), body.couponCode ?? null);
    return json({ price });
  }),
  http.post('/api/reservations', async ({ request }) => {
    const b = (await request.json()) as any;
    const usage: Record<string, number> = {};
    const u = configUsage(MENU, b.config); for (const [k, v] of Object.entries(u)) usage[k] = v * b.qty;
    const r = db.reserve(MENU, b.lineId, usage, b.idempotencyKey);
    return r.ok ? json(r) : json(r, 409);
  }),
  http.put('/api/reservations/:lineId', async ({ request, params }) => {
    const b = (await request.json()) as any;
    const usage: Record<string, number> = {};
    const u = configUsage(MENU, b.config); for (const [k, v] of Object.entries(u)) usage[k] = v * b.qty;
    const r = db.editReservation(MENU, String(params.lineId), usage);
    return r.ok ? json(r) : json(r, 409);
  }),
  http.delete('/api/reservations/:lineId', ({ params }) => { db.release(String(params.lineId)); return json({ ok: true }); }),
  http.post('/api/checkout', async ({ request }) => {
    const b = (await request.json()) as any;
    const r = db.checkout(MENU, b.idempotencyKey, b.lines, b.paymentMethod, b.couponCode ?? null);
    return r.ok ? json(r) : json(r, 409);
  }),
  http.get('/api/orders', () => { db.seedIfNeeded(MENU, seedData as any); return json({ orders: db.listOrders() }); }),
];
