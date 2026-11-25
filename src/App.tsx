import { useEffect, useMemo, useRef, useState } from 'react';
import type { CartLine, CartPrice, Config, Menu, Order } from './engine/types';
import { validate } from './engine/rules';
import { maxAddable } from './engine/stock';
import { bdt } from './engine/pricing';
import * as api from './api/client';
import { askAssistant, AssistantError } from './assistant/gemini';
import './App.css';

const CLIENT_KEY = 'sob.client.v2';
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const clone = (c: Config): Config => JSON.parse(JSON.stringify(c));

export default function App() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [config, setConfig] = useState<Config>({});
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [coupon, setCoupon] = useState('');
  const [price, setPrice] = useState<CartPrice | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [configPrice, setConfigPrice] = useState<CartPrice | null>(null);
  const [configPriceError, setConfigPriceError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // serverTime - clientNow
  const [nowTick, setNowTick] = useState(Date.now());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payment, setPayment] = useState('cash');
  const [msg, setMsg] = useState<string | null>(null);
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);
  const [question, setQuestion] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const addKeyRef = useRef<string>(uid());
  const payKeyRef = useRef<string>(uid());
  const previewRef = useRef<api.PricePreview | null>(null);
  const configPreviewRef = useRef<api.PricePreview | null>(null);
  const serverNow = () => Date.now() + offset;

  // Restore unfinished config + cart after refresh (Part G); server reservations persist too.
  useEffect(() => {
    try { const raw = localStorage.getItem(CLIENT_KEY); if (raw) { const s = JSON.parse(raw); setConfig(s.config ?? {}); setCart(s.cart ?? []); setCoupon(s.coupon ?? ''); } } catch { /* ignore */ }
  }, []);
  useEffect(() => { localStorage.setItem(CLIENT_KEY, JSON.stringify({ config, cart, coupon })); }, [config, cart, coupon]);
  useEffect(() => { const t = setInterval(() => setNowTick(Date.now()), 1000); return () => clearInterval(t); }, []);

  const refreshOrders = async () => { const r = await api.fetchOrders(); setOffset(r.serverTime - Date.now()); setOrders(r.data.orders); };
  useEffect(() => { (async () => { const r = await api.fetchMenu(); setOffset(r.serverTime - Date.now()); setMenu(r.data.menu); await refreshOrders(); })(); }, []);

  // Mark lines expired using SERVER time only (offset applied), never raw Date.now().
  const liveCart = useMemo(() => cart.map((l) => ({ ...l, expired: l.reservedUntil !== null && l.reservedUntil <= serverNow() })), [cart, offset, nowTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const violations = useMemo(() => (menu ? validate(config, menu) : []), [menu, config]);
  const editingLine = liveCart.find((l) => l.lineId === editingId) ?? null;

  const requestPrice = () => {
    if (!previewRef.current) previewRef.current = new api.PricePreview((p) => { setPrice(p); setPriceError(null); }, (e) => setPriceError(e.message));
    const lines = liveCart.filter((l) => !l.expired).map((l) => ({ config: l.config, qty: l.qty }));
    if (editingId) { /* price preview covers cart only; current config is priced after save */ }
    if (!lines.length) { setPrice(null); setPriceError(null); return; }
    previewRef.current.request(lines, coupon.trim() ? coupon.trim().toUpperCase() : null);
  };
  useEffect(requestPrice, [JSON.stringify(liveCart.map((l) => [l.config, l.qty, l.expired])), coupon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Part C async preview for the item being configured right now (brief: "the price
  // shown while configuring comes from the mock /price endpoint"). Same debounce and
  // stale-response protection as the cart preview, through its own PricePreview.
  const configHasItems = useMemo(() => Object.values(config).some((sel) => Object.values(sel).some((q) => q > 0)), [config]);
  const requestConfigPrice = () => {
    if (!configPreviewRef.current) configPreviewRef.current = new api.PricePreview((p) => { setConfigPrice(p); setConfigPriceError(null); }, (e) => setConfigPriceError(e.message));
    if (!configHasItems) { setConfigPrice(null); setConfigPriceError(null); return; }
    configPreviewRef.current.request([{ config, qty }], null);
  };
  useEffect(requestConfigPrice, [JSON.stringify(config), qty, configHasItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetDemo = () => {
    for (const k of ['sob.client.v1', 'sob.client.v2', 'sob.server.v1', 'sob.server.v2']) localStorage.removeItem(k);
    window.location.reload();
  };

  if (!menu) return <p className="loading">Loading menu...</p>;

  const setOpt = (groupId: string, optionId: string, next: number) => {
    setConfig((c) => { const n = clone(c); n[groupId] = { ...(n[groupId] ?? {}) }; if (next <= 0) delete n[groupId][optionId]; else n[groupId][optionId] = next; return n; });
  };

  const addToCart = async () => {
    if (violations.length) { setMsg('Fix the rule problems first: ' + violations.map((v) => v.message).join('; ')); return; }
    const key = addKeyRef.current; // triple-click safe: same key while this add is in flight / not yet reset
    const lineId = editingId ?? `line-${key}`;
    try {
      if (editingId) {
        const r = await api.putReservation(lineId, config, qty); setOffset(r.serverTime - Date.now());
        setCart((c) => c.map((l) => (l.lineId === lineId ? { ...l, config: clone(config), qty, reservedUntil: r.data.expiresAt, expired: false } : l)));
        setEditingId(null); setMsg('Cart item updated.');
      } else {
        const r = await api.postReservation(lineId, config, qty, key); setOffset(r.serverTime - Date.now());
        setCart((c) => (c.some((l) => l.lineId === lineId) ? c : [...c, { lineId, config: clone(config), qty, idempotencyKey: key, reservedUntil: r.data.expiresAt, expired: false }]));
        setMsg('Added to cart. Stock reserved for 5 minutes.');
      }
      addKeyRef.current = uid(); payKeyRef.current = uid();
      setConfig({}); setQty(1);
    } catch (e: any) { setMsg(e.message); } // blocked edits/adds surface every shortage, e.g. "Short: 2 egg, 2 cheese"
  };

  const removeLine = async (lineId: string) => { await api.deleteReservation(lineId).catch(() => {}); setCart((c) => c.filter((l) => l.lineId !== lineId)); if (editingId === lineId) setEditingId(null); payKeyRef.current = uid(); };

  const startEdit = (line: CartLine) => { setEditingId(line.lineId); setConfig(clone(line.config)); setQty(line.qty); setMsg('Editing cart item. Your current reservation counts as available while you edit.'); };

  const pay = async () => {
    const active = liveCart.filter((l) => !l.expired);
    if (!active.length) { setMsg('Cart is empty or all items expired.'); return; }
    try {
      const r = await api.postCheckout(payKeyRef.current, active.map((l) => ({ lineId: l.lineId, config: l.config, qty: l.qty })), payment, coupon.trim() ? coupon.trim().toUpperCase() : null);
      setOffset(r.serverTime - Date.now());
      setCart((c) => c.filter((l) => l.expired)); setMsg(`Order placed: ${r.data.order.orderId} - Total BDT ${bdt(r.data.order.total)}`);
      payKeyRef.current = uid(); await refreshOrders();
    } catch (e: any) { setMsg(e.message); }
  };

  const downloadOrders = () => {
    const blob = new Blob([JSON.stringify(orders, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'orders.json'; a.click(); URL.revokeObjectURL(a.href);
  };

  const ask = async () => {
    if (!question.trim()) return;
    setChatBusy(true);
    try { const a = await askAssistant(question, orders, menu, import.meta.env.VITE_GEMINI_API_KEY as string | undefined); setChat((c) => [...c, { q: question, a }]); }
    catch (e: any) { const a = e instanceof AssistantError ? e.message : 'Something went wrong.'; setChat((c) => [...c, { q: question, a }]); }
    setQuestion(''); setChatBusy(false);
  };

  const summary = (c: Config) => Object.entries(c).flatMap(([g, sel]) => Object.entries(sel).filter(([, q]) => q > 0).map(([id, q]) => `${menu.groups.find((x) => x.id === g)?.options.find((o) => o.id === id)?.name ?? id} x${q}`)).join(', ');

  return (
    <div className="app">
      <header className="hero">
        <h1>{menu.name} - Smart Order Builder</h1>
        <div className="sub">
          <span className="price-pill">Base price: BDT {bdt(menu.basePricePoisha)}</span>
          <span>Build a breakfast, we handle the rules, stock and pricing.</span>
        </div>
      </header>
      {msg && <p role="alert" className="alert">{msg}</p>}
      <div className="layout">
        <main>
          <div className="card">
            <h2 className="card-title">{editingId ? 'Edit cart item' : 'Build your order'}</h2>
            {menu.groups.map((g) => (
              <div key={g.id} className="card">
                <div className="group-head">
                  <span className="group-name">{g.name}</span>
                  <span className="group-hint">(min {g.min}, max {g.max})</span>
                </div>
                {g.options.map((o) => {
                  const q = config[g.id]?.[o.id] ?? 0;
                  const more = maxAddable(menu, liveCart, config, o.id, editingId ?? undefined);
                  return (
                    <div key={o.id} className={q > 0 ? 'opt-row selected' : 'opt-row'}>
                      <span>
                        <span className="opt-name">{o.name}</span>
                        <span className="opt-price"> - BDT {bdt(o.pricePoisha)}</span>
                        <small className={more <= 0 ? 'stock-hint out' : 'stock-hint'}>({more === Number.MAX_SAFE_INTEGER ? 'unlimited stock' : `${more} more can be added`})</small>
                      </span>
                      <span className="stepper">
                        <button aria-label={`decrease ${o.name}`} onClick={() => setOpt(g.id, o.id, q - 1)} disabled={q <= 0}>-</button>
                        <span className="qty">{q}</span>
                        <button aria-label={`increase ${o.name}`} onClick={() => setOpt(g.id, o.id, q + 1)} disabled={more <= 0}>+</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
            {violations.length > 0 && <ul className="violations">{violations.map((v) => <li key={v.ruleId + v.message}>{v.message}</li>)}</ul>}
            {configHasItems && (configPriceError
              ? <p className="price-error">Item price failed: {configPriceError} <button className="btn btn-ghost btn-small" onClick={requestConfigPrice}>Retry</button></p>
              : configPrice && configPrice.lines[0] ? <div className="price-rows">
                  <div className="price-row"><span>Item unit price:</span><span>BDT {bdt(configPrice.lines[0].unitSubtotal)}</span></div>
                  {configPrice.lines[0].p2Discount > 0 && <div className="price-row discount"><span>Extras deal:</span><span>-BDT {bdt(configPrice.lines[0].p2Discount)}</span></div>}
                  {configPrice.lines[0].p1Discount > 0 && <div className="price-row discount"><span>Combo discount:</span><span>-BDT {bdt(configPrice.lines[0].p1Discount)}</span></div>}
                  <div className="price-row payable"><span>This item{qty > 1 ? ` (x${qty})` : ''}:</span><span>BDT {bdt(configPrice.lines[0].lineTotal)}</span></div>
                </div>
              : <p className="calc-note">Calculating item price...</p>)}
            <div className="builder-footer">
              <label className="field">Quantity (1-3): <select value={qty} onChange={(e) => setQty(Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
              <button className="btn btn-primary" onClick={addToCart}>{editingId ? 'Save changes' : 'Add to Cart'}</button>
              {editingId && <button className="btn btn-ghost" onClick={() => { setEditingId(null); setConfig({}); }}>Cancel edit</button>}
            </div>
          </div>
        </main>
        <aside className="sidebar">
          <div className="card">
            <h2 className="card-title">Cart</h2>
            {liveCart.length === 0 && <p className="empty-note">Cart is empty.</p>}
            {liveCart.map((l) => {
              const left = l.reservedUntil !== null ? Math.max(0, Math.floor((l.reservedUntil - serverNow()) / 1000)) : 0;
              return (
                <div key={l.lineId} className={l.expired ? 'cart-line expired' : 'cart-line'}>
                  <div className="items">{summary(l.config)} (qty {l.qty})</div>
                  <div className="meta">
                    {l.expired
                      ? <span className="timer-chip expired-chip">Reservation expired - this item is read-only, remove it.</span>
                      : <span className="timer-chip">Reservation: {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left</span>}
                  </div>
                  <div className="actions">
                    {!l.expired && <button className="btn btn-ghost btn-small" onClick={() => startEdit(l)}>Edit</button>}
                    <button className="btn btn-ghost btn-small" onClick={() => removeLine(l.lineId)}>Remove</button>
                  </div>
                </div>
              );
            })}
            <label className="field">Coupon: <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="MORNING15" /></label>
            {priceError ? <p className="price-error">Price preview failed: {priceError} <button className="btn btn-ghost btn-small" onClick={requestPrice}>Retry</button></p>
              : price ? <div className="price-rows">
                  <div className="price-row"><span>Subtotal:</span><span>BDT {bdt(price.subtotal)}</span></div>
                  {price.discountCode && <div className="price-row discount"><span>Discount ({price.discountCode}):</span><span>-BDT {bdt(price.cartDiscount)}</span></div>}
                  {price.couponRejected && <p className="coupon-rejected">{price.couponRejected}</p>}
                  <div className="price-row"><span>VAT (5%):</span><span>BDT {bdt(price.vat)}</span></div>
                  <div className="price-row payable"><span>Payable:</span><span>BDT {bdt(price.payable)}</span></div>
                </div> : liveCart.length > 0 && <p className="calc-note">Calculating price...</p>}
            <div className="pay-row">
              <label className="field">Payment: <select value={payment} onChange={(e) => setPayment(e.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="bkash">bKash</option></select></label>
              <button className="btn btn-primary" onClick={pay}>Pay</button>
            </div>
          </div>
          <div className="card">
            <h2 className="card-title">Orders</h2>
            <button className="btn btn-ghost btn-small" onClick={downloadOrders}>Download orders.json</button>
            <button className="btn btn-ghost btn-small" onClick={resetDemo} style={{ marginLeft: 8 }}>Reset demo data</button>
            <div style={{ marginTop: 8 }}>
              {orders.map((o) => (
                <div key={o.orderId} className="order-row">
                  <span className="oid">{o.orderId}</span>
                  <span className="ometa">BDT {bdt(o.total)} - {o.paymentMethod}<br />{new Date(o.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2 className="card-title">Sales Assistant</h2>
            <div className="chat-log">
              {chat.map((c, i) => (
                <div key={i} className="chat-pair">
                  <div className="bubble q"><span className="who">You:</span>{c.q}</div>
                  <div className="bubble a"><span className="who">Assistant:</span>{c.a}</div>
                </div>
              ))}
            </div>
            <div className="chat-row">
              <input className="chat-input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about sales..." />
              <button className="btn btn-primary" onClick={ask} disabled={chatBusy}>Ask</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
