import { Card } from "@/components/app/Shell";
import { CATALOG } from "@/lib/aegis/catalog";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, CalendarCheck, CreditCard, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

const SLOTS = ["09:00", "11:00", "14:00", "16:00"];

export default function CatalogDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const item = CATALOG.find((c) => c.id === id);
  const [date, setDate] = useState(() => new Date(Date.now() + 86400e3).toISOString().slice(0, 10));
  const [slot, setSlot] = useState(SLOTS[0]);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState("");
  const book = useMutation(api.customer.createBooking);
  const send = useMutation(api.customer.postComment);
  const comments = useQuery(api.customer.threadComments, { thread: `catalog:${id}` }) ?? [];

  if (!item) return <Card className="p-8 text-sm">Service not found. <Link to="/catalog" className="underline">Back to catalog</Link>.</Card>;

  async function doBook() {
    if (!item) return;
    await book({ catalogId: item.id, catalogTitle: item.title, date, slot });
    setDone(`Locked in! ${item.title} on ${date} at ${slot}. See you there.`);
  }

  return (
    <div className="space-y-4">
      <Link to="/catalog" className="inline-flex items-center gap-1 text-[13px] text-neutral-500"><ArrowLeft className="h-3.5 w-3.5" /> Catalog</Link>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="h-2" style={{ background: `linear-gradient(90deg, ${item.color}, #0f172a)` }} />
        <div className="grid gap-6 p-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: item.color }}>{item.duration}</span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">{item.title}</h2>
            <p className="mt-1 text-[15px] font-medium" style={{ color: item.color }}>{item.tagline}</p>
            <p className="mt-3 max-w-xl text-sm leading-7 text-neutral-600">{item.description}</p>
            <ul className="mt-4 space-y-1.5 text-[13px]">
              {item.includes.map((x) => <li key={x} className="flex gap-2"><span style={{ color: item.color }}>✓</span> {x}</li>)}
            </ul>
            <p className="mt-4 rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-5 text-emerald-300">{item.technical}</p>
          </div>
          <div className="space-y-3 lg:col-span-2">
            <Card className="p-4">
              <p className="text-2xl font-bold tabular-nums">${item.price} <span className="text-xs font-normal text-neutral-400">{item.currency} {item.unit}</span></p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5" /></label>
                <label>Time<select value={slot} onChange={(e) => setSlot(e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5">{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></label>
              </div>
              <button onClick={doBook} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ background: item.color }}>
                <CalendarCheck className="h-4 w-4" /> Book this time
              </button>
              <button onClick={() => nav(`/checkout?item=${item.id}`)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-50">
                <CreditCard className="h-4 w-4" /> Pay ${item.price} now
              </button>
              {done && <p className="mt-2 rounded bg-emerald-50 p-2 text-[13px] text-emerald-800">{done}</p>}
            </Card>
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold"><MessageCircle className="h-4 w-4" /> Questions? Ask below</p>
              <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                {comments.map((c) => (
                  <div key={c._id} className="rounded bg-neutral-50 p-2 text-[13px]">
                    <p>{c.body}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-neutral-400">{c.ownerEmail} · {new Date(c.createdAt).toLocaleString()}</p>
                  </div>
                ))}
                {comments.length === 0 && <p className="text-[13px] text-neutral-400">No questions yet — yours could be first.</p>}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ask about this service…" className="flex-1 rounded border border-neutral-200 px-2.5 py-1.5 text-[13px]" />
                <button onClick={async () => { if (msg.trim()) { await send({ thread: `catalog:${id}`, body: msg.trim() }); setMsg(""); } }} className="rounded bg-neutral-900 px-3 py-1.5 text-[13px] text-white">Send</button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
