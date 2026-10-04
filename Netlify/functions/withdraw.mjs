import crypto from "node:crypto";
import { json } from "../lib/shared.mjs";

const PATH = "/api/developer/v1/withdrawals";
const sha = (s) => crypto.createHash("sha256").update(s).digest();
const authed = (req) => {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer /, ""), e = process.env.ADMIN_TOKEN || "";
  return e.length >= 20 && crypto.timingSafeEqual(sha(t), sha(e));
};
const mask = (p) => p.slice(0, 3) + "****" + p.slice(-3);

export default async (req) => {
  if (!authed(req)) { await new Promise((r) => setTimeout(r, 1500)); return json({ error: "Unauthorized" }, 401); }
  const phone = process.env.WITHDRAW_PHONE, name = process.env.WITHDRAW_NAME, secret = process.env.DATAMART_SIGNING_SECRET;
  const max = Number(process.env.WITHDRAW_MAX || 300);
  if (!phone || !name || !secret || !process.env.DATAMART_API_KEY) return json({ error: "Server not configured" }, 500);
  // The destination is fixed on the server. A request can only choose the amount, never where the money goes.
  if (req.method === "GET") return json({ destination: mask(phone), name, max });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let b; try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!(amount >= 1) || amount > max) return json({ error: `Amount must be between 1 and ${max}` }, 400);
  if (!/^[A-Za-z0-9-]{16,64}$/.test(String(b.idemKey))) return json({ error: "Missing idempotency key" }, 400);

  const raw = JSON.stringify({ amount, phoneNumber: phone, network: "MTN", recipientName: name, clientRef: "NH-WD-" + b.idemKey.slice(0, 12) });
  const ts = Date.now().toString();
  const signature = crypto.createHmac("sha256", secret).update(`${ts}.POST.${PATH}.${raw}`).digest("hex");
  const res = await fetch("https://api.datamartgh.shop" + PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": process.env.DATAMART_API_KEY, "X-Idempotency-Key": b.idemKey, "X-Signature": signature, "X-Timestamp": ts },
    body: raw,
  });
  const d = await res.json().catch(() => ({}));
  console.log("withdrawal", res.status, d.data?.reference, amount);
  if (!res.ok || d.status !== "success") return json({ error: d.message || d.error || "DataMart rejected the withdrawal" }, 502);
  const { reference, status, fee, totalCharged, balanceAfter } = d.data;
  return json({ reference, status, amount, fee, totalCharged, balanceAfter });
};
export const config = { path: "/api/admin/withdraw" };
