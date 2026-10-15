import { Card } from "@/components/app/Shell";
import { CATALOG } from "@/lib/aegis/catalog";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, Lock } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

export default function Checkout() {
  const [sp] = useSearchParams();
  const [itemId, setItemId] = useState(sp.get("item") ?? CATALOG[0].id);
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [paid, setPaid] = useState<string | null>(null);
  const pay = useMutation(api.customer.createOrder);
  const orders = useQuery(api.customer.listOrders) ?? [];
  const item = CATALOG.find((c) => c.id === itemId)!;
  const fee = Math.round(item.price * 0.029 * 100) / 100;
  const total = Math.round((item.price + fee) * 100) / 100;

  async function doPay() {
    if (!/^\d[\d ]{11,}$/.test(card)) { alert("That card number looks off — check the digits?"); return; }
    await pay({ catalogId: item.id, catalogTitle: item.title, amount: total, currency: item.currency });
    setPaid(`${item.title} — $${total} ${item.currency}. Receipt saved to your orders.`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Lock className="h-4 w-4" /> Secure checkout</p>
        <label className="mt-3 block text-xs">Service
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-2 text-sm">
            {CATALOG.map((c) => <option key={c.id} value={c.id}>{c.title} — ${c.price}</option>)}
          </select>
        </label>
        <label className="mt-2 block text-xs">Card number (demo — use 4242…)
          <input value={card} onChange={(e) => setCard(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded border border-neutral-200 px-2.5 py-2 font-mono text-sm" />
        </label>
        <div className="mt-3 space-y-1 rounded-lg bg-neutral-50 p-3 text-[13px] tabular-nums">
          <div className="flex justify-between"><span className="text-neutral-500">{item.title}</span><span>${item.price}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Processing (2.9%)</span><span>${fee}</span></div>
          <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold"><span>Total</span><span>${total} {item.currency}</span></div>
        </div>
        <button onClick={doPay} className="mt-3 w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          Pay ${total} now
        </button>
        {paid && <p className="mt-2 flex items-start gap-1.5 rounded bg-emerald-50 p-2.5 text-[13px] text-emerald-800"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" /> {paid}</p>}
        <p className="mt-2 font-mono text-[11px] text-neutral-400">demo gateway · no real charge · order persisted to Convex</p>
      </Card>
      <Card className="p-0">
        <p className="px-5 pt-4 text-sm font-semibold">Order history ({orders.length})</p>
        <div className="mt-2 divide-y divide-neutral-100">
          {orders.map((o) => (
            <div key={o._id} className="flex items-center gap-3 px-5 py-3">
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">{o.status}</span>
              <div className="flex-1">
                <p className="text-[13px] font-medium">{o.catalogTitle}</p>
                <p className="font-mono text-[11px] text-neutral-400">{o.ownerEmail} · {new Date(o.createdAt).toLocaleString()}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums">${o.amount} {o.currency}</span>
            </div>
          ))}
          {orders.length === 0 && <p className="px-5 py-10 text-center text-[13px] text-neutral-400">No orders yet — your receipt drawer is ready when you are.</p>}
        </div>
      </Card>
    </div>
  );
}
