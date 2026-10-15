import { useAuth } from "@/hooks/use-auth";
import { getSelected, loadAll, setSelected } from "@/lib/trace/store";
import {
  ArrowLeftRight, CalendarDays, Database, FlaskConical, LayoutDashboard, LogOut,
  MessagesSquare, Network, Search, ShieldAlert, ShieldCheck, Briefcase, Landmark, Settings2, Store,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";

const NAV = [
  { to: "/dashboard", label: "Your Dashboard", icon: LayoutDashboard },
  { to: "/catalog", label: "Catalog", icon: Store },
  { to: "/datasets", label: "Datasets", icon: Database },
  { to: "/studio", label: "Studio", icon: FlaskConical },
  { to: "/detections", label: "Detections", icon: ShieldAlert },
  { to: "/network", label: "Network", icon: Network },
  { to: "/fx-market", label: "FX Market", icon: Landmark },
  { to: "/fx-converter", label: "Converter", icon: ArrowLeftRight },
  { to: "/bookings", label: "Bookings", icon: CalendarDays },
  { to: "/community", label: "Community", icon: MessagesSquare },
  { to: "/investigations", label: "Cases", icon: Briefcase },
  { to: "/admin", label: "Admin", icon: ShieldCheck },
  { to: "/governance", label: "Governance", icon: Settings2 },
];

export function Shell({ children, title, sub }: { children: React.ReactNode; title: string; sub?: string }) {
  const { signOut, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [datasets, setDatasets] = useState(loadAll());
  const [sel, setSel] = useState(getSelected());
  const [q, setQ] = useState("");

  useEffect(() => {
    const f = () => { setDatasets(loadAll()); setSel(getSelected()); };
    window.addEventListener("trace:update", f);
    return () => window.removeEventListener("trace:update", f);
  }, [loc.pathname]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-500 text-xs font-bold text-white">Æ</div>
            <span className="text-sm font-bold tracking-tight">Aegis</span>
            <span className="hidden rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[10px] text-emerald-800 sm:block">● live</span>
          </Link>
          <div className="relative ml-2 hidden flex-1 max-w-sm md:block">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) nav(`/catalog?q=${encodeURIComponent(q.trim())}`);
              }}
              placeholder="Search services, alerts, accounts… (Enter)"
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-8 pr-3 text-[13px] outline-none focus:border-indigo-400"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={sel ?? ""} onChange={(e) => { setSelected(e.target.value); window.dispatchEvent(new Event("trace:update")); }}
              className="max-w-[190px] rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
              title="Active dataset"
            >
              <option value="">No dataset</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.txns.length})</option>)}
            </select>
            <span className="hidden text-xs text-neutral-500 lg:block">{String(user?.email ?? "member")}</span>
            <button onClick={async () => { await signOut(); nav("/"); }} className="rounded-md border border-neutral-200 p-1.5 hover:bg-neutral-100" title="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-0 px-0 md:gap-6 md:px-4">
        <aside className="sticky top-[49px] hidden h-[calc(100vh-49px)] w-52 shrink-0 flex-col gap-0.5 overflow-auto py-4 md:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium ${isActive ? "bg-slate-950 text-white shadow" : "text-neutral-600 hover:bg-white hover:shadow-sm"}`}>
              <n.icon className="h-4 w-4" strokeWidth={1.75} /> {n.label}
            </NavLink>
          ))}
          <div className="mt-4 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-500 p-3 text-white">
            <p className="text-xs font-semibold">Need a human?</p>
            <p className="mt-0.5 text-[11px] leading-4 text-white/80">Book a review — we answer fast and friendly.</p>
            <Link to="/bookings" className="mt-2 block rounded-lg bg-white px-2.5 py-1.5 text-center text-xs font-semibold text-slate-900">Book a time</Link>
          </div>
          <p className="mt-4 px-3 font-mono text-[10px] leading-4 text-neutral-400">aegis v2.0 · api: ok · fx: live<br />every tx tells a story</p>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-2">
          <div className="mb-5">
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            {sub && <p className="mt-0.5 text-[13px] text-neutral-500">{sub}</p>}
          </div>
          {children}
          <nav className="fixed bottom-0 left-0 right-0 z-20 flex justify-around border-t border-neutral-200 bg-white py-2 md:hidden">
            {NAV.slice(0, 6).map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `p-2 ${isActive ? "text-indigo-600" : "text-neutral-400"}`}>
                <n.icon className="h-5 w-5" strokeWidth={1.75} />
              </NavLink>
            ))}
          </nav>
          <div className="h-12 md:hidden" />
        </main>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-neutral-200 bg-white shadow-sm ${className}`}>{children}</div>;
}
export function num(n: number) { return n.toLocaleString("en-IN"); }
export function emit() { window.dispatchEvent(new Event("trace:update")); }
