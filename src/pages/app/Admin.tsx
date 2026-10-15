import { Card } from "@/components/app/Shell";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";

type Tab = "bookings" | "orders" | "posts" | "workspace" | "audit";

export default function Admin() {
  const data = useQuery(api.customer.adminOverview);
  const [tab, setTab] = useState<Tab>("bookings");

  const stats = data ? [
    ["Bookings", data.bookings.length, "from-indigo-500 to-violet-500"],
    ["Revenue orders", data.orders.length, "from-emerald-500 to-teal-500"],
    ["Community posts", data.posts.length, "from-pink-500 to-orange-400"],
    ["Datasets", data.datasets.length, "from-sky-500 to-indigo-500"],
    ["Cases", data.investigations.length, "from-amber-500 to-red-500"],
  ] : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 md:grid-cols-5">
        {stats.map(([k, v, g]) => (
          <div key={k as string} className="bg-white p-4">
            <div className={`h-1 w-8 rounded-full bg-gradient-to-r ${g}`} />
            <p className="mt-2 text-[11px] uppercase tracking-wider text-neutral-400">{k}</p>
            <p className="font-mono text-xl font-bold">{data ? v : "…"}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-1 overflow-auto border-b border-neutral-200 text-[13px]">
        {(["bookings", "orders", "posts", "workspace", "audit"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap px-3 py-2 capitalize ${tab === t ? "border-b-2 border-indigo-600 font-semibold" : "text-neutral-500"}`}>{t}</button>
        ))}
      </div>
      {!data && <Card className="p-8 text-center text-sm text-neutral-400">Loading the control room…</Card>}
      {data && tab === "bookings" && (
        <Card className="divide-y divide-neutral-100 p-0">
          {data.bookings.map((b) => (
            <div key={b._id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className={`rounded px-2 py-0.5 text-[11px] ${b.status === "confirmed" ? "bg-indigo-100 text-indigo-800" : "bg-neutral-100 text-neutral-500"}`}>{b.status}</span>
              <span className="flex-1 font-medium">{b.catalogTitle} <span className="font-mono font-normal text-neutral-400">· {b.date} {b.slot} · {b.ownerEmail}</span></span>
            </div>
          ))}
          {data.bookings.length === 0 && <Empty label="No bookings yet." />}
        </Card>
      )}
      {data && tab === "orders" && (
        <Card className="divide-y divide-neutral-100 p-0">
          {data.orders.map((o) => (
            <div key={o._id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">{o.status}</span>
              <span className="flex-1 font-medium">{o.catalogTitle} <span className="font-mono font-normal text-neutral-400">· {o.ownerEmail}</span></span>
              <span className="font-semibold tabular-nums">${o.amount} {o.currency}</span>
            </div>
          ))}
          {data.orders.length === 0 && <Empty label="No payments yet." />}
          {data.orders.length > 0 && (
            <p className="bg-neutral-50 px-4 py-2.5 font-mono text-xs">Total processed: ${data.orders.reduce((s, o) => s + o.amount, 0).toFixed(2)}</p>
          )}
        </Card>
      )}
      {data && tab === "posts" && (
        <Card className="divide-y divide-neutral-100 p-0">
          {data.posts.map((p) => (
            <div key={p._id} className="px-4 py-2.5 text-[13px]">
              <p className="font-medium">{p.title} <span className="font-mono font-normal text-neutral-400">· {p.ownerEmail}{p.attachmentName ? ` · 📎 ${p.attachmentName}` : ""}</span></p>
              <p className="mt-0.5 line-clamp-2 text-neutral-500">{p.body}</p>
            </div>
          ))}
          {data.posts.length === 0 && <Empty label="No community posts yet." />}
        </Card>
      )}
      {data && tab === "workspace" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <p className="text-[13px] font-semibold">Datasets in library ({data.datasets.length})</p>
            <div className="mt-2 space-y-1.5 text-[13px]">
              {data.datasets.map((d) => <p key={d._id} className="flex justify-between border-b border-neutral-100 pb-1"><span>{d.name}</span><span className="font-mono text-xs text-neutral-400">{d.rowCount} rows · {d.source}</span></p>)}
              {data.datasets.length === 0 && <p className="text-neutral-400">None synced from browsers yet.</p>}
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-[13px] font-semibold">Cases ({data.investigations.length})</p>
            <div className="mt-2 space-y-1.5 text-[13px]">
              {data.investigations.map((c) => <p key={c._id} className="flex justify-between border-b border-neutral-100 pb-1"><span>{c.title}</span><span className="font-mono text-xs text-neutral-400">{c.status}</span></p>)}
              {data.investigations.length === 0 && <p className="text-neutral-400">No cases yet.</p>}
            </div>
          </Card>
        </div>
      )}
      {data && tab === "audit" && (
        <Card className="p-4">
          <div className="max-h-96 space-y-1.5 overflow-auto font-mono text-xs">
            {data.audit.map((a) => <p key={a._id} className="border-b border-neutral-100 pb-1.5"><span className="text-neutral-400">{new Date(a.createdAt).toLocaleString()}</span> {a.actor} → {a.action} — {a.target}</p>)}
          </div>
        </Card>
      )}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="px-4 py-8 text-center text-[13px] text-neutral-400">{label}</p>;
}
