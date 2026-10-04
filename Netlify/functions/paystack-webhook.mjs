import crypto from "node:crypto";
import { fulfil, json } from "../lib/shared.mjs";

export default async (req) => {
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature") || "";
  const hash = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(raw).digest("hex");
  const ok = sig.length === hash.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hash));
  if (!ok) return json({ error: "Invalid signature" }, 401);
  const ev = JSON.parse(raw);
  if (ev.event === "charge.success" && ev.data?.status === "success") {
    const result = await fulfil(ev.data.reference, ev.data);
    console.log("fulfil", ev.data.reference, result);
  }
  return json({ received: true }); // always 200 once verified so Paystack does not retry
};
export const config = { path: "/api/paystack-webhook" };
