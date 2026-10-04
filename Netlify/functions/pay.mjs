import { PRICES, MTN, orders, json } from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const gb = Number(b.gb), price = PRICES[gb];
  const phone = String(b.phone || "").replace(/\D/g, "").replace(/^233/, "0");
  if (!price) return json({ error: "Unknown bundle" }, 400);
  if (!MTN.test(phone)) return json({ error: "Invalid MTN number" }, 400);

  const ref = `NH-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  const site = process.env.SITE_URL || process.env.URL;
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `${phone}@customer.nirvanahub.app`, // Paystack requires an email; replace with a real one if you collect it
      amount: Math.round(price * 100), currency: "GHS", reference: ref,
      callback_url: `${site}/?ref=${ref}`,
      metadata: { gb, phone, bundle: `${gb}GB MTN` },
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.status) { console.error("Paystack init failed", d); return json({ error: "Could not start payment" }, 502); }
  await orders().setJSON(ref, { ref, gb, price, phone, status: "pending", createdAt: new Date().toISOString() });
  return json({ authorization_url: d.data.authorization_url, reference: ref });
};
export const config = { path: "/api/pay" };
