import { Link } from "react-router";
import { ArrowRight, CalendarCheck, CreditCard, MessagesSquare, ShieldCheck, Sparkles, Store } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
      {/* glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-indigo-600/30 blur-[120px]" />
        <div className="absolute right-1/5 top-40 h-80 w-80 rounded-full bg-pink-500/20 blur-[110px]" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-cyan-400/15 blur-[100px]" />
      </div>

      <header className="relative border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">Æ</div>
            <div>
              <p className="text-[15px] font-bold tracking-tight">Aegis</p>
              <p className="font-mono text-[10px] text-slate-400">every transaction tells a story</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/catalog" className="hidden rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 sm:block">Services</Link>
            <Link to="/auth" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5">Sign in</Link>
            <Link to="/auth" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-200">Get started free</Link>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6">
        <section className="py-16 text-center md:py-24">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 font-mono text-[11px] text-slate-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> v2.0 · customer portal is live · api status: ok
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl">
            Money clarity,
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">without the headache.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-7 text-slate-400">
            Hey — welcome to Aegis. Bring us your messiest transaction export and we will turn it
            into plain answers: what looks normal, what deserves a closer look, and exactly why.
            Serious analysis, friendly humans, zero jargon.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 hover:opacity-90">
              Start free — it takes a minute <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/catalog" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium hover:bg-white/10">
              <Store className="h-4 w-4" /> Browse services
            </Link>
          </div>
          <p className="mt-4 font-mono text-[11px] text-slate-500">no credit card · cancel anytime · your data stays yours</p>
        </section>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
          {[
            { icon: ShieldCheck, c: "text-indigo-300", t: "Bank-grade rigor", d: "Detection, evidence packs, and audit trails built for reviewers and regulators alike." },
            { icon: Sparkles, c: "text-pink-300", t: "Friendly by default", d: "Real humans, plain language, and bookings in one click. Nobody talks down to you here." },
            { icon: MessagesSquare, c: "text-cyan-300", t: "A community that helps", d: "Post your data, ask anything, and get answers from analysts and fellow customers." },
          ].map((f) => (
            <div key={f.t} className="bg-slate-950/90 p-6 text-left">
              <f.icon className={`h-5 w-5 ${f.c}`} strokeWidth={1.75} />
              <p className="mt-3 text-sm font-semibold">{f.t}</p>
              <p className="mt-1.5 text-[13px] leading-6 text-slate-400">{f.d}</p>
            </div>
          ))}
        </section>

        <section className="py-14">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-bold tracking-tight">What can we do for you?</h2>
            <Link to="/catalog" className="text-sm text-indigo-300 hover:underline">See all six →</Link>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              ["#4F46E5", "Transaction Health Check", "$149", "Upload a CSV, get answers in an hour."],
              ["#DB2777", "Team Detection Workshop", "$399", "Your crew solves real cases together. Fun, promise."],
              ["#059669", "FX & Currency Briefing", "$79", "Finally understand what your money is worth."],
            ].map(([c, t, p, d]) => (
              <Link key={t} to="/catalog" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:bg-white/[0.06]">
                <div className="h-1 w-10 rounded-full" style={{ background: c }} />
                <p className="mt-3 font-semibold">{t}</p>
                <p className="text-[13px] text-slate-400">{d}</p>
                <p className="mt-2 text-sm font-bold tabular-nums">{p}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-4 pb-16 md:grid-cols-3">
          {[
            { icon: CalendarCheck, t: "Book in seconds", d: "Pick a service and a slot. Confirmations are instant, rescheduling is painless." },
            { icon: CreditCard, t: "Pay with confidence", d: "Transparent pricing, itemized receipts, and a full order history." },
            { icon: ShieldCheck, t: "Evidence you can defend", d: "Every finding cites real transactions. Scores are priorities, never verdicts." },
          ].map((s) => (
            <div key={s.t} className="rounded-2xl border border-white/10 p-5">
              <s.icon className="h-5 w-5 text-amber-300" strokeWidth={1.75} />
              <p className="mt-2 text-sm font-semibold">{s.t}</p>
              <p className="mt-1 text-[13px] leading-6 text-slate-400">{s.d}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-5 font-mono text-[11px] text-slate-500">
          <span>Aegis · every transaction tells a story</span>
          <span>status: all systems go · build 2.0</span>
        </div>
      </footer>
    </div>
  );
}
