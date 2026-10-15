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
      <Link to="/" className="group flex items-center gap-3 px-4 pb-5 pt-5" title="Back to home">
        <span className="transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3"><Logo size={40} className="shrink-0" /></span>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="display truncate text-[19px] font-bold tracking-tight text-foreground">Aegis</p>
            <p className="mono truncate text-[10px] tracking-wide text-muted-foreground">connect the evidence</p>
          </div>
        )}
      </Link>
      <nav className="thin-scroll flex-1 overflow-y-auto px-2 pb-4" aria-label="Primary">
        {SECTIONS.map((s) => (
          <div key={s.head} className="mt-5 first:mt-1">
            {!collapsed && <p className="px-2.5 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">{s.head}</p>}
            <div className="space-y-0.5">
              {s.items.map((n) => (
                <NavLink
                  key={n.to} to={n.to} title={n.label}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-gradient-to-r from-primary/25 to-primary/5 text-foreground shadow-[inset_1px_0_0_var(--primary)]"
                        : "text-muted-foreground hover:translate-x-0.5 hover:bg-[color:var(--glass-hi)] hover:text-foreground"
                    } ${collapsed ? "justify-center" : ""}`
                  }
                >
                  <n.icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" strokeWidth={1.75} />
                  {!collapsed && <span className="truncate">{n.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {!collapsed && (
        <div className="border-t border-border/70 p-3">
          <div className="rounded-lg border border-border/70 bg-[color:var(--glass)] px-3 py-2.5 backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]">
            <p className="truncate text-xs font-semibold text-foreground">{active?.name ?? "No workspace dataset"}</p>
            <p className="mono mt-0.5 text-[10px] text-muted-foreground">{active ? `${active.txns.length.toLocaleString("en-IN")} txns · tier ${active.tier}` : "upload or generate to begin"}</p>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <div className="grad-bg flex h-7 w-7 shrink-0 items-center justify-center rounded-full p-px">
              <span className="flex h-full w-full items-center justify-center rounded-full bg-[#0b0a1a]/85 text-[11px] font-bold text-white">
                {(String(user?.email ?? "A")[0] ?? "A").toUpperCase()}
              </span>
            </div>
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{String(user?.email ?? "analyst")}</p>
            <Link to="/settings" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground" title="Settings"><Settings className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen text-foreground antialiased">
      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-border bg-[color:var(--sidebar)] backdrop-blur-2xl animate-in slide-in-from-left duration-300">{side}</aside>
        </div>
      )}
      <div className="flex">
        {/* desktop sidebar */}
        <aside className={`sticky top-0 hidden h-screen shrink-0 border-r border-border bg-[color:var(--sidebar)] backdrop-blur-2xl transition-all duration-300 md:block ${collapsed ? "w-14" : "w-60"}`}>
          {side}
        </aside>
        <div className="min-w-0 flex-1">
          {/* topbar */}
          <header className="sticky top-0 z-30 border-b border-border bg-[color:var(--background)]/70 backdrop-blur-xl">
            <div className="flex items-center gap-2 px-3 py-2.5 md:px-6">
              <button className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-4 w-4" /></button>
              <button className="hidden rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground md:block" onClick={() => setCollapsed(!collapsed)} aria-label="Collapse sidebar">
                {collapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </button>
              <nav className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex" aria-label="Breadcrumb">
                {crumbs.map((c, i) => (
                  <span key={c} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-muted-foreground/40">/</span>}
                    <span className={i === crumbs.length - 1 ? "font-medium text-foreground" : ""}>{c}</span>
                  </span>
                ))}
              </nav>
              <div className="relative ml-3 hidden w-72 lg:block">
                <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                  placeholder="Search alerts, accounts, transactions…"
                  className="w-full rounded-full border border-input bg-[color:var(--glass)] py-1.5 pl-9 pr-3 text-[13px] outline-none backdrop-blur-md transition-all placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]/60 focus:bg-[color:var(--glass-hi)]"
                  aria-label="Global search"
                />
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <select
                  value={sel ?? ""} onChange={(e) => { setSelected(e.target.value); emit(); }}
                  className="max-w-[180px] rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs text-foreground backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]"
                  title="Workspace dataset" aria-label="Workspace dataset"
                >
                  <option value="">No dataset</option>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.txns.length})</option>)}
                </select>
                <div className="relative">
                  <button onClick={() => setNotifOpen(!notifOpen)} className="relative rounded-full p-2 text-muted-foreground transition-all hover:bg-[color:var(--glass-hi)] hover:text-foreground" title="Notifications" aria-label="Notifications">
                    <Bell className="h-4 w-4" />
                    {unread > 0 && <span className="tnum absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--destructive)] px-1 text-[9px] font-bold text-white shadow-[0_0_12px_-2px_rgba(251,113,133,0.8)]">{unread}</span>}
                  </button>
                  {notifOpen && (
                    <div className="glass absolute right-0 top-10 w-80 rounded-xl p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                      <p className="display px-2 py-1 text-xs font-semibold">High-priority reviews ({unread})</p>
                      {(active?.alerts.filter((a) => a.severity === "high" || a.severity === "critical").slice(0, 5) ?? []).map((a) => (
                        <Link key={a.id} to={`/detections/${a.id}`} onClick={() => setNotifOpen(false)} className="block truncate rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[color:var(--glass-hi)]">{a.title}</Link>
                      ))}
                      {unread === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Nothing urgent. New detection events will appear here.</p>}
                    </div>
                  )}
                </div>
                <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="rounded-full p-2 text-muted-foreground transition-all hover:rotate-45 hover:bg-[color:var(--glass-hi)] hover:text-foreground" title="Toggle theme" aria-label="Toggle theme">
                  {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </button>
                <div className="relative">
                  <button onClick={() => setMenuOpen(!menuOpen)} className="grad-bg flex h-8 w-8 items-center justify-center rounded-full p-px transition-transform hover:scale-105" aria-label="Account menu">
                    <span className="flex h-full w-full items-center justify-center rounded-full bg-[#0b0a1a]/85 text-[11px] font-bold text-white">
                      {(String(user?.email ?? "A")[0] ?? "A").toUpperCase()}
                    </span>
                  </button>
                  {menuOpen && (
                    <div className="glass absolute right-0 top-11 w-48 rounded-xl p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                      <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{String(user?.email ?? "")}</p>
                      <Link to="/" onClick={() => setMenuOpen(false)} className="block rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-[color:var(--glass-hi)]">Back to home</Link>
                      <Link to="/settings" onClick={() => setMenuOpen(false)} className="block rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-[color:var(--glass-hi)]">Settings</Link>
                      <button onClick={async () => { await signOut(); nav("/"); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-[color:var(--glass-hi)]">
                        <LogOut className="h-3.5 w-3.5" /> Sign out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* mobile search */}
            <div className="px-3 pb-2.5 lg:hidden">
              <div className="relative">
                <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                  placeholder="Search…" className="w-full rounded-full border border-input bg-[color:var(--glass)] py-1.5 pl-9 pr-3 text-[13px] outline-none backdrop-blur-md" aria-label="Search" />
              </div>
            </div>
          </header>
          {offline && (
            <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 px-3 py-2 text-[13px] md:px-6" role="alert">
              <WifiOff className="h-4 w-4 shrink-0 text-[color:var(--warning)]" />
              <p className="min-w-0 flex-1"><span className="font-semibold">Sync offline</span> <span className="text-muted-foreground">— can't reach <span className="mono">{backendHost}</span>, so reviews, notes and cases stay on this device only. Set <span className="mono">VITE_CONVEX_URL</span> to your Convex deployment URL in Keys, then reload.</span></p>
              <button onClick={() => window.location.reload()} className="shrink-0 rounded-full border border-border bg-[color:var(--glass)] px-3 py-1 text-xs font-medium backdrop-blur-md transition-colors hover:bg-[color:var(--glass-hi)]">Retry connection</button>
            </div>
          )}
          <main key={sel ?? "none"} className="px-3 py-6 md:px-6">
            <div className="rise mb-5">
              <h1 className="display text-[22px] font-bold leading-tight tracking-tight text-foreground">{title}</h1>
              {sub && <p className="mt-1 max-w-3xl text-[13px] leading-6 text-muted-foreground">{sub}</p>}
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
