import { orders, json } from "../lib/shared.mjs";
export default async (req) => {
  const ref = new URL(req.url).searchParams.get("ref") || "";
  if (!/^NH-[A-Z0-9-]+$/.test(ref)) return json({ error: "Bad ref" }, 400);
  const o = await orders().get(ref, { type: "json" });
  return json({ status: o ? o.status : "unknown" }); // never expose phone numbers
};
export const config = { path: "/api/order-status" };
