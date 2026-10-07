import crypto from "node:crypto";
import { orders, json } from "../lib/shared.mjs";

const sha = (s) => crypto.createHash("sha256").update(s).digest();
const authed = (req) => {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer /, ""), e = process.env.ADMIN_TOKEN || "";
  return e.length >= 20 && crypto.timingSafeEqual(sha(t), sha(e));
};

export default async (req) => {
  if (!authed(req)) { await new Promise((r) => setTimeout(r, 1500)); return json({ error: "Unauthorized" }, 401); }
  const store = orders();
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
    if (!/^NH-[A-Z0-9-]+$/.test(String(b.ref))) return json({ error: "Bad reference" }, 400);
    const o = await store.get(b.ref, { type: "json" });
    if (!o) return json({ error: "Order not found" }, 404);
    if (o.status !== "delivery_failed") return json({ error: "Only failed deliveries can be marked as sent" }, 409);
    // Stored as "delivered" so the customer's tracker and the summary treat it as done.
    await store.setJSON(b.ref, { ...o, status: "delivered", manualSent: true, manualSentAt: new Date().toISOString() });
    return json({ ok: true });
  }
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const { blobs } = await store.list();
  // Order references start with a time-based code, so sorting the keys puts the newest last.
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 50);
  const rows = (await Promise.all(keys.map((k) => store.get(k, { type: "json" }).catch(() => null)))).filter(Boolean);
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return json({
    orders: rows.map((o) => ({
      ref: o.ref, gb: o.gb, price: o.price, phone: o.phone, status: o.status, createdAt: o.createdAt,
      error: o.error ? String(o.error).slice(0, 160) : undefined, datamartRef: o.datamart?.reference, manual: o.manualSent || undefined,
    })),
  });
};
export const config = { path: "/api/admin/orders" };
