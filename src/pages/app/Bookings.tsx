import { Card } from "@/components/app/Shell";
import { CATALOG } from "@/lib/aegis/catalog";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { CalendarX } from "lucide-react";
import { useState } from "react";

export default function Bookings() {
  const bookings = useQuery(api.customer.listBookings) ?? [];
  const create = useMutation(api.customer.createBooking);
  const cancel = useMutation(api.customer.cancelBooking);
  const [item, setItem] = useState(CATALOG[0].id);
  const [date, setDate] = useState(() => new Date(Date.now() + 86400e3).toISOString().slice(0, 10));
  const [slot, setSlot] = useState("11:00");
  const upcoming = bookings.filter((b) => b.status === "confirmed");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5">
        <p className="text-sm font-semibold">Book a time that suits you</p>
        <p className="mt-0.5 text-[13px] text-neutral-500">Pick a service, grab a slot. Confirmations land instantly.</p>
        <label className="mt-3 block text-xs">Service
          <select value={item} onChange={(e) => setItem(e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-2 text-sm">
            {CATALOG.map((c) => <option key={c.id} value={c.id}>{c.title} — ${c.price}</option>)}
          </select>
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-2" /></label>
          <label>Time<select value={slot} onChange={(e) => setSlot(e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-2">
            {["09:00", "11:00", "14:00", "16:00"].map((s) => <option key={s}>{s}</option>)}
          </select></label>
        </div>
        <button
          onClick={async () => {
            const c = CATALOG.find((x) => x.id === item)!;
            await create({ catalogId: c.id, catalogTitle: c.title, date, slot });
          }}
          className="mt-3 w-full rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Confirm booking
        </button>
      </Card>
      <Card className="p-0 lg:col-span-2">
        <p className="px-5 pt-4 text-sm font-semibold">Your schedule ({upcoming.length} upcoming)</p>
        <div className="mt-2 divide-y divide-neutral-100">
          {bookings.map((b) => (
            <div key={b._id} className="flex items-center gap-3 px-5 py-3">
              <div className={`h-9 w-1.5 rounded-full ${b.status === "confirmed" ? "bg-gradient-to-b from-indigo-500 to-pink-500" : "bg-neutral-200"}`} />
              <div className="flex-1">
                <p className="text-sm font-medium">{b.catalogTitle}</p>
                <p className="font-mono text-xs text-neutral-400">{b.date} · {b.slot} · {b.ownerEmail} · {b.status}</p>
              </div>
              {b.status === "confirmed" && (
                <button onClick={() => cancel({ id: b._id })} className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-900">
                  <CalendarX className="h-3 w-3" /> Cancel
                </button>
              )}
            </div>
          ))}
          {bookings.length === 0 && <p className="px-5 py-10 text-center text-[13px] text-neutral-400">Nothing booked yet. Your calm, empty calendar awaits.</p>}
        </div>
      </Card>
    </div>
  );
}
