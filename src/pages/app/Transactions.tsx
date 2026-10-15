import { Card, Empty, PanelTitle, btnGhost, num, shortId } from "@/components/app/Shell";
import { download, getSelected, loadAll } from "@/lib/trace/store";
import { toCSV } from "@/lib/trace/csv";
import { useMemo, useState } from "react";
import { Link } from "react-router";

const PAGE = 25;

export default function Transactions() {
  const params = new URLSearchParams(window.location.search);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [channel, setChannel] = useState("");
  const [cur, setCur] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);

  const rows = useMemo(() => {
    if (!ds) return [];
    return ds.txns.filter((t) =>
      (!q || t.id.toLowerCase().includes(q.toLowerCase()) || t.sender.toLowerCase().includes(q.toLowerCase()) || t.receiver.toLowerCase().includes(q.toLowerCase())) &&
      (!channel || t.channel === channel) && (!cur || t.currency === cur) &&
      (!minAmt || t.amount >= Number(minAmt)));
  }, [ds, q, channel, cur, minAmt]);

  if (!ds) return <Card><Empty title="No dataset available" body="Upload a transaction CSV or generate a synthetic dataset to begin analysis." /></Card>;

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const detail = open ? ds.txns.find((t) => t.id === open) : null;
  const signals = open ? ds.alerts.filter((a) => a.txnIds.includes(open)) : [];

  return (
    <div className="space-y-4">
      <div className="glass rise flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search ID, sender, receiver…" className="w-64 rounded-full border border-input bg-[color:var(--glass-hi)] px-3.5 py-1.5 text-[13px] outline-none backdrop-blur-md transition-all placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]/60" aria-label="Search transactions" />
        <select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(0); }} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Channel">
          <option value="">All channels</option>{[...new Set(ds.txns.map((t) => t.channel))].map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={cur} onChange={(e) => { setCur(e.target.value); setPage(0); }} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Currency">
          <option value="">All currencies</option>{[...new Set(ds.txns.map((t) => t.currency))].map((c) => <option key={c}>{c}</option>)}
        </select>
        <input value={minAmt} onChange={(e) => { setMinAmt(e.target.value); setPage(0); }} placeholder="Min amount" inputMode="numeric" className="w-28 rounded-full border border-input bg-[color:var(--glass-hi)] px-3.5 py-1.5 text-[13px] outline-none backdrop-blur-md transition-all focus:border-[color:var(--ring)]/60" aria-label="Minimum amount" />
        <button onClick={() => download(`${ds.name}-transactions.csv`, toCSV(rows.slice(0, 5000).map((t) => ({ id: t.id, ts: t.timestamp, sender: t.sender, receiver: t.receiver, amount: t.amount, currency: t.currency, channel: t.channel, status: t.status }))))} className="ml-auto rounded-full border border-border bg-[color:var(--glass)] px-3.5 py-1.5 text-[13px] backdrop-blur-md transition-all hover:border-[color:var(--glass-border-hi)] hover:bg-[color:var(--glass-hi)]">Export filtered (≤5k)</button>
      </div>
      <Card>
        <PanelTitle title={`${num(rows.length)} transactions`} sub={`${ds.name} · page ${page + 1} of ${pages}`} />
        <div className="overflow-x-auto">
          <table className="mt-1 w-full min-w-[900px] text-left text-[13px]">
            <thead><tr className="border-y border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              {["Transaction ID", "Timestamp", "Sender", "Receiver", "Amount", "Ccy", "Channel", "Status", "Signals"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {slice.map((t) => {
                const n = ds.alerts.filter((a) => a.txnIds.includes(t.id)).length;
                return (
                  <tr key={t.id} className="cursor-pointer border-b border-border/40 transition-colors hover:bg-[color:var(--glass-hi)]" onClick={() => setOpen(t.id)}>
                    <td className="mono px-3 py-2.5 text-xs text-[color:var(--primary)]">{t.id}</td>
                    <td className="tnum whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{t.timestamp.slice(0, 16).replace("T", " ")}</td>
                    <td className="mono max-w-[160px] truncate px-3 py-2 text-xs" title={t.sender}>{shortId(t.sender)}</td>
                    <td className="mono max-w-[160px] truncate px-3 py-2 text-xs" title={t.receiver}>{shortId(t.receiver)}</td>
                    <td className="tnum px-3 py-2 font-semibold">{t.amount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2">{t.currency}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.channel}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.status}</td>
                    <td className="px-3 py-2">{n > 0 ? <span className="rounded bg-[color:var(--warning)]/15 px-1.5 py-0.5 text-[11px] text-[color:var(--warning)]">{n}</span> : <span className="text-muted-foreground/50">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No transactions match these filters.</p>}
        </div>
        <div className="flex items-center gap-2 p-3">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className={btnGhost + " disabled:opacity-40"}>Previous</button>
          <span className="tnum text-xs text-muted-foreground">Page {page + 1} / {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className={btnGhost + " disabled:opacity-40"}>Next</button>
        </div>
      </Card>
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(null)} />
          <aside className="thin-scroll relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-[color:var(--elevated)]/95 p-6 backdrop-blur-2xl animate-in slide-in-from-right duration-300">
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Exact record</p>
            <h3 className="display mono mt-1 text-base font-bold">{detail.id}</h3>
            <dl className="mt-4 space-y-2 text-[13px]">
              {[["Timestamp", detail.timestamp], ["Sender", detail.sender], ["Receiver", detail.receiver],
                ["Amount", `${detail.amount.toLocaleString("en-IN")} ${detail.currency}`], ["Channel", detail.channel],
                ["Route", `${detail.origin_country} → ${detail.dest_country}`], ["Purpose", detail.purpose || "—"], ["Status", detail.status],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-border/50 pb-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="tnum text-right font-medium">{v}</dd></div>)}
            </dl>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detection signals ({signals.length})</p>
            {signals.map((a) => <Link key={a.id} to={`/detections/${a.id}`} className="mt-1.5 block rounded border border-border p-2.5 text-[13px] hover:bg-muted">{a.title}</Link>)}
            {signals.length === 0 && <p className="mt-1.5 text-[13px] text-muted-foreground">No detector flagged this record.</p>}
            <button onClick={() => setOpen(null)} className="mt-5 w-full rounded-full border border-border bg-[color:var(--glass)] py-2 text-[13px] backdrop-blur-md transition-colors hover:bg-[color:var(--glass-hi)]">Close</button>
          </aside>
        </div>
      )}
    </div>
  );
}
