import { getStore } from "@netlify/blobs";

// Server-side price list. The browser's price is NEVER trusted.
export const PRICES = { 1:5.9, 2:10, 3:15, 4:20, 5:25, 6:28, 8:36, 10:45, 15:65, 20:85, 25:110, 30:135, 40:170, 50:230 };
export const MTN = /^0(24|25|53|54|55|59)\d{7}$/;
export const orders = () => getStore("orders");
export const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

// Body fields and header confirmed from DataMart's docs. Endpoint confirmed: POST /api/developer/purchase.
// Test with a 1GB order first.
export async function deliver(order) {
  const url = process.env.DATAMART_API_URL || "https://api.datamartgh.shop/api/developer/purchase";
  const key = process.env.DATAMART_API_KEY, secret = process.env.DATAMART_API_SECRET;
  if (!key) throw new Error("DATAMART_API_KEY missing");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": key, ...(secret ? { "X-API-Secret": secret } : {}) },
    body: JSON.stringify({ phoneNumber: order.phone, network: "YELLO", capacity: String(order.gb), gateway: "wallet", ref: (process.env.DATAMART_REF_PREFIX || "") + order.ref }),
  });
  const body = await res.json().catch(() => ({}));
  // Documented success shape: { status: "success", data: { orderId, reference, orderStatus, ... } }
  if (!res.ok || body.status !== "success" || String(body.data?.orderStatus).toLowerCase() === "failed")
    throw new Error("DataMart: " + JSON.stringify(body).slice(0, 300));
  return { orderId: body.data.orderId, reference: body.data.reference, orderStatus: body.data.orderStatus };
}

// Runs once per paid order. Status moves pending -> paid -> delivering -> delivered | delivery_failed.
// We only call DataMart from "paid", and never retry automatically, so a customer cannot be delivered twice.
export async function fulfil(ref, paystackData) {
  const store = orders();
  const order = await store.get(ref, { type: "json" });
  if (!order) return "unknown_order";
  if (order.status !== "pending") return order.status;
  if (paystackData.currency !== "GHS" || paystackData.amount !== Math.round(order.price * 100)) {
    await store.setJSON(ref, { ...order, status: "amount_mismatch" });
    return "amount_mismatch";
  }
  await store.setJSON(ref, { ...order, status: "delivering", paidAt: new Date().toISOString() });
  try {
    const dm = await deliver(order);
    await store.setJSON(ref, { ...order, status: "delivered", datamart: dm, deliveredAt: new Date().toISOString() });
    return "delivered";
  } catch (e) {
    console.error("DELIVERY FAILED", ref, order.phone, order.gb + "GB", e.message);
    await store.setJSON(ref, { ...order, status: "delivery_failed", error: e.message });
    return "delivery_failed";
  }
}
