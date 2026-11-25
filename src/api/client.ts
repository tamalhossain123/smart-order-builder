import type { CartPrice, Menu, Order } from '../engine/types';

export interface ApiResult<T> { data: T; serverTime: number }
async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return { data: body as T, serverTime: body.serverTime };
}
export const fetchMenu = () => call<{ menu: Menu }>('/api/menu');
export const fetchOrders = () => call<{ orders: Order[] }>('/api/orders');
export const postPrice = (lines: { config: any; qty: number }[], couponCode: string | null, signal?: AbortSignal) =>
  call<{ price: CartPrice }>('/api/price', { method: 'POST', body: JSON.stringify({ lines, couponCode }), signal });
export const postReservation = (lineId: string, config: any, qty: number, idempotencyKey: string) =>
  call<any>('/api/reservations', { method: 'POST', body: JSON.stringify({ lineId, config, qty, idempotencyKey }) });
export const putReservation = (lineId: string, config: any, qty: number) =>
  call<any>(`/api/reservations/${lineId}`, { method: 'PUT', body: JSON.stringify({ config, qty }) });
export const deleteReservation = (lineId: string) => call<any>(`/api/reservations/${lineId}`, { method: 'DELETE' });
export const postCheckout = (idempotencyKey: string, lines: any[], paymentMethod: string, couponCode: string | null) =>
  call<any>('/api/checkout', { method: 'POST', body: JSON.stringify({ idempotencyKey, lines, paymentMethod, couponCode }) });

/**
 * Price preview controller: 300ms debounce, and a monotonically increasing request id
 * plus AbortController guarantee a stale response can never overwrite a newer price.
 */
export class PricePreview {
  private timer: any = null; private seq = 0; private abort: AbortController | null = null;
  constructor(private onPrice: (p: CartPrice) => void, private onError: (e: Error) => void) {}
  request(lines: { config: any; qty: number }[], couponCode: string | null) {
    clearTimeout(this.timer);
    const mySeq = ++this.seq;
    this.timer = setTimeout(async () => {
      this.abort?.abort();
      const ctrl = new AbortController(); this.abort = ctrl;
      try {
        const r = await postPrice(lines, couponCode, ctrl.signal);
        if (mySeq !== this.seq) return; // stale: a newer request exists
        this.onPrice(r.data.price);
      } catch (e: any) {
        if (e?.name === 'AbortError' || mySeq !== this.seq) return;
        this.onError(e instanceof Error ? e : new Error('Price failed'));
      }
    }, 300);
  }
}
