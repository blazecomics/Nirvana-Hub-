import { PRICES, MTN, orders, json } from "../lib/shared.mjs";

async function handle(req) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!process.env.PAYSTACK_SECRET_KEY) return json({ error: "Setup problem: PAYSTACK_SECRET_KEY is missing on the server." }, 500);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const gb = Number(b.gb), price = PRICES[gb];
  const phone = String(b.phone || "").replace(/\D/g, "").replace(/^233/, "0");
  if (!price) return json({ error: "Unknown bundle" }, 400);
  if (!MTN.test(phone)) return json({ error: "Invalid MTN number" }, 400);

  const ref = `NH-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  const site = process.env.SITE_URL || process.env.URL;
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `${phone}@customer.nirvanahub.app`, // Paystack requires an email; replace with a real one if you collect it
      amount: Math.round(price * 100), currency: "GHS", reference: ref,
      callback_url: `${site}/?ref=${ref}`,
      metadata: { gb, phone, bundle: `${gb}GB MTN` },
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.status) {
    console.error("Paystack init failed", res.status, d);
    return json({ error: "Paystack said: " + String(d.message || "HTTP " + res.status).slice(0, 140) }, 502);
  }
  await orders().setJSON(ref, { ref, gb, price, phone, status: "pending", createdAt: new Date().toISOString() });
  return json({ authorization_url: d.data.authorization_url, reference: ref });
}

export default async (req) => {
  try { return await handle(req); }
  catch (e) { console.error("pay error", e); return json({ error: "Server error: " + String(e.message).slice(0, 120) }, 500); }
};
export const config = { path: "/api/pay" };
