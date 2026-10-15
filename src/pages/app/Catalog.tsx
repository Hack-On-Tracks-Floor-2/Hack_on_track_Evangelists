import { Card } from "@/components/app/Shell";
import { searchCatalog } from "@/lib/aegis/catalog";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

export default function Catalog() {
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const items = searchCatalog(q);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search services — try “audit”, “FX”, “workshop”…"
          className="w-full max-w-md rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-indigo-400"
        />
        <span className="font-mono text-xs text-neutral-400">GET /catalog?q={q || "all"} → {items.length} results</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((c) => (
          <Link key={c.id} to={`/catalog/${c.id}`}>
            <Card className="group h-full overflow-hidden p-0 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${c.color}, ${c.color}88)` }} />
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: c.color }}>{c.duration}</span>
                  <span className="text-xs text-neutral-400">{c.unit}</span>
                </div>
                <p className="mt-2.5 text-[15px] font-semibold tracking-tight">{c.title}</p>
                <p className="mt-0.5 text-[13px] font-medium" style={{ color: c.color }}>{c.tagline}</p>
                <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-neutral-500">{c.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-lg font-bold tabular-nums">${c.price} <span className="text-xs font-normal text-neutral-400">{c.currency}</span></span>
                  <span className="text-[13px] font-medium text-neutral-900 group-hover:underline">View details →</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {items.length === 0 && (
        <Card className="p-10 text-center text-sm text-neutral-500">
          Nothing matches “{q}”. Try “review”, “workshop”, or “audit” — or tell us what you need in the community.
        </Card>
      )}
    </div>
  );
}
