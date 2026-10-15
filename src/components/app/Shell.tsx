import { useAuth } from "@/hooks/use-auth";
import { getSelected, loadAll, setSelected } from "@/lib/trace/store";
import { seedDemoWorkspace } from "./safety";
import { Logo } from "./Logo";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import {
  Bell, BookOpenCheck, Briefcase, Database,
  History, Landmark, LayoutDashboard, LogOut, Menu,
  Moon, House, Network, Search, Settings, ShieldAlert, Sun, Users, Waypoints, WifiOff, X,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { emit } from "./ui";
export * from "./ui";

const SECTIONS: { head: string; items: { to: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  { head: "Overview", items: [{ to: "/", label: "Back to Home", icon: House }, { to: "/dashboard", label: "Intelligence Dashboard", icon: LayoutDashboard }] },
  {
    head: "Monitoring",
    items: [
      { to: "/domestic", label: "Domestic India", icon: Landmark },
      { to: "/international", label: "International Payments", icon: Waypoints },
      { to: "/transactions", label: "Transaction Monitoring", icon: BookOpenCheck },
      { to: "/detections", label: "Detections", icon: ShieldAlert },
      { to: "/network", label: "Entity Network", icon: Network },
      { to: "/fund-flows", label: "Fund Flows", icon: Waypoints },
    ],
  },
  {
    head: "Currency Intelligence",
    items: [
      { to: "/fx-market", label: "Live FX Market", icon: Landmark },
      { to: "/fx-history", label: "FX History", icon: History },
    ],
  },
  {
    head: "Data & Analytics",
    items: [
      { to: "/datasets", label: "Dataset Library", icon: Database },
      { to: "/reports", label: "Reports", icon: BookOpenCheck },
    ],
  },
  {
    head: "Investigations",
    items: [
      { to: "/investigations", label: "Investigation Cases", icon: Briefcase },
      { to: "/entities", label: "Entities", icon: Users },
      { to: "/audit", label: "Audit Trail", icon: History },
    ],
  },
];

const CRUMBS: Record<string, string[]> = {
  "/dashboard": ["Overview", "Intelligence Dashboard"],
  "/domestic": ["Monitoring", "Domestic India"],
  "/international": ["Monitoring", "International Payments"],
  "/transactions": ["Monitoring", "Transaction Monitoring"],
  "/detections": ["Monitoring", "Detections"],
  "/network": ["Monitoring", "Entity Network"],
  "/fund-flows": ["Monitoring", "Fund Flows"],
  "/flows": ["Monitoring", "Fund Flows"],
  "/fx-market": ["Currency Intelligence", "Live FX Market"],
  "/fx-history": ["Currency Intelligence", "FX History"],
  "/datasets": ["Data & Analytics", "Dataset Library"],
  "/rules": ["Data & Analytics", "Detection Rules"],
  "/models": ["Data & Analytics", "Models & Evaluation"],
  "/evaluation": ["Data & Analytics", "Models & Evaluation"],
  "/reports": ["Data & Analytics", "Reports"],
  "/investigations": ["Investigations", "Investigation Cases"],
  "/audit": ["Investigations", "Audit Trail"],
  "/settings": ["Workspace", "Settings"],
  "/governance": ["Workspace", "Settings"],
};

export function Shell({ children, title, sub }: { children: React.ReactNode; title: string; sub?: string }) {
  const { signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const [datasets, setDatasets] = useState(loadAll());
  const [sel, setSel] = useState(getSelected());
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    const f = () => { setDatasets(loadAll()); setSel(getSelected()); };
    window.addEventListener("trace:update", f);
    return () => window.removeEventListener("trace:update", f);
  }, [loc.pathname]);
  useEffect(() => setMobileOpen(false), [loc.pathname]);
  useEffect(() => {
    // Self-healing workspace: if the library is ever empty (e.g. everything
    // deleted), reseed the sample so no screen is left without data.
    const seeded = seedDemoWorkspace();
    if (seeded || loadAll().length !== datasets.length) {
      setDatasets(loadAll());
      setSel(getSelected());
    }
    if (seeded) {
      toast.info("Demo workspace ready", { description: "Seeded a labelled synthetic dataset so every chart has real data. Upload your own CSV anytime." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  // Backend reachability probe: if the shared review feed still hasn't
  // resolved after 8s, the frontend can't reach the Convex deployment
  // (stale/missing VITE_CONVEX_URL) — say so plainly instead of letting
  // every action fail with a per-button toast.
  const probe = useQuery(api.trace.listAlertReviews);
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 8000); return () => clearTimeout(t); }, []);
  const offline = slow && probe === undefined;
  // Shown in the offline banner so the mismatch is diagnosable at a glance
  // (a hostname is a public endpoint address, not a secret).
  let backendHost = "(not configured)";
  try {
    const u = import.meta.env.VITE_CONVEX_URL as string | undefined;
    if (u) backendHost = new URL(u).host;
  } catch { backendHost = "(invalid URL)"; }
  const active = useMemo(() => loadAll().find((d) => d.id === (getSelected() ?? loadAll()[0]?.id)), [datasets, sel, loc.pathname]);
  const unread = active?.alerts.filter((a) => a.severity === "high" || a.severity === "critical").length ?? 0;
  const crumbs = CRUMBS[loc.pathname] ?? ["Workspace", title];

  function submitSearch() {
    if (!q.trim()) return;
    if (/^[A-Z-]{3,}|^\d|SYN-|ALT-/i.test(q.trim())) nav(`/transactions?q=${encodeURIComponent(q.trim())}`);
    else nav(`/detections?q=${encodeURIComponent(q.trim())}`);
  }

  const side = (
    <div className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-3 px-4 pb-5 pt-5" title="Back to home">
        <Logo size={44} className="shrink-0" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[19px] font-extrabold tracking-tight text-foreground">Aegis</p>
            <p className="mono truncate text-[11px] tracking-wide text-muted-foreground">connect the evidence</p>
          </div>
        )}
      </Link>
      <nav className="thin-scroll flex-1 overflow-y-auto px-2 pb-4" aria-label="Primary">
        {SECTIONS.map((s) => (
          <div key={s.head} className="mt-4 first:mt-1">
            {!collapsed && <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">{s.head}</p>}
            <div className="space-y-px">
              {s.items.map((n) => (
                <NavLink
                  key={n.to} to={n.to} title={n.label}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
                      isActive ? "bg-[color:var(--primary)]/15 text-foreground shadow-[inset_2px_0_0_var(--primary)]" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    } ${collapsed ? "justify-center" : ""}`
                  }
                >
                  <n.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {!collapsed && <span className="truncate">{n.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {!collapsed && (
        <div className="border-t border-border p-3">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-foreground">{active?.name ?? "No workspace dataset"}</p>
            <p className="mono mt-0.5 text-[10px] text-muted-foreground">{active ? `${active.txns.length.toLocaleString("en-IN")} txns · tier ${active.tier}` : "upload or generate to begin"}</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--teal)]/20 text-[11px] font-bold text-[color:var(--teal)]">
              {(String(user?.email ?? "A")[0] ?? "A").toUpperCase()}
            </div>
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{String(user?.email ?? "analyst")}</p>
            <Link to="/settings" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Settings"><Settings className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-border bg-[color:var(--sidebar)]">{side}</aside>
        </div>
      )}
      <div className="flex">
        {/* desktop sidebar */}
        <aside className={`sticky top-0 hidden h-screen shrink-0 border-r border-border bg-[color:var(--sidebar)] transition-all md:block ${collapsed ? "w-14" : "w-60"}`}>
          {side}
        </aside>
        <div className="min-w-0 flex-1">
          {/* topbar */}
          <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
            <div className="flex items-center gap-2 px-3 py-2 md:px-5">
              <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-4 w-4" /></button>
              <button className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-muted md:block" onClick={() => setCollapsed(!collapsed)} aria-label="Collapse sidebar">
                {collapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </button>
              <nav className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex" aria-label="Breadcrumb">
                {crumbs.map((c, i) => (
                  <span key={c} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-muted-foreground/50">/</span>}
                    <span className={i === crumbs.length - 1 ? "font-medium text-foreground" : ""}>{c}</span>
                  </span>
                ))}
              </nav>
              <div className="relative ml-2 hidden w-64 lg:block">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                  placeholder="Search alerts, accounts, transactions…"
                  className="w-full rounded-md border border-input bg-card py-1.5 pl-8 pr-3 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]"
                  aria-label="Global search"
                />
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <select
                  value={sel ?? ""} onChange={(e) => { setSelected(e.target.value); emit(); }}
                  className="max-w-[180px] rounded-md border border-input bg-card px-2 py-1.5 text-xs text-foreground"
                  title="Workspace dataset" aria-label="Workspace dataset"
                >
                  <option value="">No dataset</option>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.txns.length})</option>)}
                </select>
                <div className="relative">
                  <button onClick={() => setNotifOpen(!notifOpen)} className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Notifications" aria-label="Notifications">
                    <Bell className="h-4 w-4" />
                    {unread > 0 && <span className="tnum absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[color:var(--destructive)] px-0.5 text-[9px] font-bold text-white">{unread}</span>}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 top-9 w-80 rounded-lg border border-border bg-[color:var(--elevated)] p-2 shadow-xl">
                      <p className="px-2 py-1 text-xs font-semibold">High-priority reviews ({unread})</p>
                      {(active?.alerts.filter((a) => a.severity === "high" || a.severity === "critical").slice(0, 5) ?? []).map((a) => (
                        <Link key={a.id} to={`/detections/${a.id}`} onClick={() => setNotifOpen(false)} className="block truncate rounded px-2 py-1.5 text-xs hover:bg-muted">{a.title}</Link>
                      ))}
                      {unread === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Nothing urgent. New detection events will appear here.</p>}
                    </div>
                  )}
                </div>
                <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Toggle theme" aria-label="Toggle theme">
                  {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </button>
                <div className="relative">
                  <button onClick={() => setMenuOpen(!menuOpen)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--primary)]/20 text-[11px] font-bold text-[color:var(--primary)]" aria-label="Account menu">
                    {(String(user?.email ?? "A")[0] ?? "A").toUpperCase()}
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-9 w-48 rounded-lg border border-border bg-[color:var(--elevated)] p-1.5 shadow-xl">
                      <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{String(user?.email ?? "")}</p>
                      <Link to="/" onClick={() => setMenuOpen(false)} className="block rounded px-2 py-1.5 text-[13px] hover:bg-muted">Back to home</Link>
                      <Link to="/settings" onClick={() => setMenuOpen(false)} className="block rounded px-2 py-1.5 text-[13px] hover:bg-muted">Settings</Link>
                      <button onClick={async () => { await signOut(); nav("/"); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-muted">
                        <LogOut className="h-3.5 w-3.5" /> Sign out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* mobile search */}
            <div className="px-3 pb-2 lg:hidden">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                  placeholder="Search…" className="w-full rounded-md border border-input bg-card py-1.5 pl-8 pr-3 text-[13px] outline-none" aria-label="Search" />
              </div>
            </div>
          </header>
          {offline && (
            <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 px-3 py-2 text-[13px] md:px-5" role="alert">
              <WifiOff className="h-4 w-4 shrink-0 text-[color:var(--warning)]" />
              <p className="min-w-0 flex-1"><span className="font-semibold">Sync offline</span> <span className="text-muted-foreground">— can't reach <span className="mono">{backendHost}</span>, so reviews, notes and cases stay on this device only. Set <span className="mono">VITE_CONVEX_URL</span> to your Convex deployment URL in Keys, then reload.</span></p>
              <button onClick={() => window.location.reload()} className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">Retry connection</button>
            </div>
          )}
          <main key={sel ?? "none"} className="px-3 py-5 md:px-6">
            <div className="mb-4">
              <h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>
              {sub && <p className="mt-0.5 max-w-3xl text-[13px] text-muted-foreground">{sub}</p>}
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
