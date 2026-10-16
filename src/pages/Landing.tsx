import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Fingerprint, Lock, Radar, ScanSearch } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "@/components/app/Logo";

const EASE = [0.22, 1, 0.36, 1] as const;

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104036_bd6924f6-3c8e-417e-8465-6d03c8c2e9e6.mp4";

function Rise({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const NAV = [
  { to: "#platform", label: "Platform" },
  { to: "#detection", label: "Detection" },
  { to: "#workflow", label: "How it works" },
  { to: "#trust", label: "Trust" },
];

const PLATFORM = [
  { t: "Any CSV, understood", d: "Unfamiliar columns, dates and currencies mapped with confidence scores — never silent guesses." },
  { t: "Explainable alerts", d: "Structuring, velocity, pass-through, cycles and an anomaly model — each alert cites its transactions." },
  { t: "Relationship graphs", d: "Entity networks and fund-flow maps surface hubs, mule chains and circular routes." },
  { t: "Corridor views", d: "Domestic and cross-border monitoring with intermediary chains and counterparty context." },
  { t: "Prioritised queue", d: "Severity meters and review-priority scores order the work — scores are priorities, not verdicts." },
  { t: "Cases & reports", d: "Status, notes, append-only audit trail and exports generated from the same records." },
];

const RULES = [
  "Transaction splitting",
  "Velocity burst",
  "Rapid pass-through",
  "Fan-in / fan-out",
  "Circular movement",
  "Dormant reactivation",
  "Unusual behaviour",
  "Cross-border outliers",
  "ML anomaly model",
];

const STEPS = [
  { n: "01", t: "Upload", d: "Any CSV — parsed and mapped in your browser." },
  { n: "02", t: "Profile", d: "Quality report flags gaps before analysis." },
  { n: "03", t: "Detect", d: "Nine rules run with evidence on every alert." },
  { n: "04", t: "Investigate", d: "Case, audit trail and a shareable report." },
];

const TRUST = [
  { icon: Fingerprint, t: "Your rows never leave the browser", d: "Only cases, notes and audit events sync to your workspace." },
  { icon: BadgeCheck, t: "Scores are priorities, not verdicts", d: "The model ranks unusualness — it never confirms wrongdoing." },
  { icon: ScanSearch, t: "Missing data is labelled", d: "Gaps and weak baselines are shown, never silently filled." },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-clip font-sans text-foreground antialiased">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-[#070611]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link to="/" className="group flex items-center gap-2.5">
            <span className="transition-transform duration-300 group-hover:scale-105"><Logo size={34} /></span>
            <div className="leading-tight">
              <p className="display text-[17px] font-bold tracking-tight">Aegis</p>
              <p className="mono text-[9px] tracking-wide text-muted-foreground">financial intelligence</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <a key={n.to} href={n.to} className="rounded-full px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="rounded-full px-3.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground">
              Sign in
            </Link>
            <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link to="/dashboard" className="inline-block rounded-full border border-[color:var(--primary)]/50 bg-[#141026]/85 px-4 py-2 text-[13px] font-semibold text-[#c4b5fd] backdrop-blur-md transition-all hover:border-[color:var(--primary)] hover:bg-[#1a1333] hover:text-white hover:shadow-[0_0_26px_-6px_rgba(167,139,250,0.75)]">
                Open workspace
              </Link>
            </motion.span>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" aria-label="Aegis introduction">
        <video
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          src={HERO_VIDEO}
          autoPlay muted loop playsInline preload="metadata" aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-[#070611]/35" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#070611]/45 via-transparent to-[#070611]" aria-hidden />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <motion.div className="absolute -top-32 left-1/4 h-72 w-72 rounded-full bg-[#7c5cff]/25 blur-[120px]"
            animate={{ x: [0, 50, 0], y: [0, 25, 0] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />
        </div>

        <div className="relative mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl py-20 text-center md:py-28">
            <motion.h1
              initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
              className="display mt-5 text-4xl font-bold leading-[1.08] tracking-tight md:text-[3rem]"
            >
              Every transaction tells a story.{" "}
              <span className="bg-gradient-to-r from-[#c4b5fd] via-[#a78bfa] to-[#f472b6] bg-clip-text text-transparent">
                Connect the evidence.
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.16, ease: EASE }}
              className="mx-auto mt-4 max-w-lg text-[15px] leading-7 text-muted-foreground"
            >
              Upload any CSV and get explainable, evidence-backed alerts — with honest limits on what the
              machine actually confirms.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.24, ease: EASE }}
              className="mt-6 flex flex-wrap justify-center gap-3"
            >
              <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Link to="/dashboard" className="edge inline-flex items-center gap-2 rounded-full border border-[color:var(--primary)]/55 bg-[#141026]/85 px-6 py-3 text-sm font-semibold text-[#c4b5fd] backdrop-blur-md transition-colors hover:bg-[#1a1333] hover:text-white">
                  Open the workspace <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.span>
              <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Link to="/datasets" className="glass inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-[color:var(--glass-border-hi)]">
                  Upload your CSV
                </Link>
              </motion.span>
            </motion.div>
          </div>
        </div>
      </section>

      <main className="relative mx-auto max-w-6xl px-5">
        {/* ── Platform ────────────────────────────────────────── */}
        <section id="platform" className="scroll-mt-20 pt-14" aria-label="Platform capabilities">
          <Rise>
            <h2 className="display text-xl font-bold tracking-tight">One workspace, six crafts</h2>
          </Rise>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORM.map((c, i) => (
              <Rise key={c.t} delay={(i % 3) * 0.06}>
                <motion.div whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 300, damping: 22 }} className="glass h-full rounded-2xl p-5">
                  <p className="display text-sm font-semibold">{c.t}</p>
                  <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{c.d}</p>
                </motion.div>
              </Rise>
            ))}
          </div>
        </section>

        {/* ── Detection ───────────────────────────────────────── */}
        <section id="detection" className="scroll-mt-20 pt-14" aria-label="Detection coverage">
          <Rise>
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-[#c4b5fd]" />
              <h2 className="display text-xl font-bold tracking-tight">Nine detection rules, every one explainable</h2>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {RULES.map((r) => (
                <span key={r} className="glass rounded-full px-3.5 py-1.5 text-[12.5px] font-medium text-foreground/90">
                  {r}
                </span>
              ))}
            </div>
            <p className="mt-4 max-w-2xl text-[13px] leading-6 text-muted-foreground">
              Seven deterministic rules plus a freshly trained anomaly model. Every alert cites the exact
              transactions behind it, and labelled demo data lets you check precision and recall before you trust the queue.
            </p>
          </Rise>
        </section>

        {/* ── Workflow ────────────────────────────────────────── */}
        <section id="workflow" className="scroll-mt-20 pt-14" aria-label="How it works">
          <Rise><h2 className="display text-xl font-bold tracking-tight">File to report in four steps</h2></Rise>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Rise key={s.n} delay={i * 0.06}>
                <div className="glass h-full rounded-2xl p-5">
                  <span className="display text-lg font-bold text-[color:var(--primary)]/80">{s.n}</span>
                  <p className="display mt-1.5 text-sm font-semibold">{s.t}</p>
                  <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{s.d}</p>
                </div>
              </Rise>
            ))}
          </div>
        </section>

        {/* ── Trust ───────────────────────────────────────────── */}
        <section id="trust" className="scroll-mt-20 py-14" aria-label="Trust">
          <Rise>
            <div className="glass rounded-3xl border border-[color:var(--primary)]/25 p-6 md:p-7">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-[#c4b5fd]" />
                <h2 className="display text-lg font-bold tracking-tight">Honest by design</h2>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {TRUST.map((t) => (
                  <div key={t.t} className="flex items-start gap-2.5">
                    <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--teal)]" />
                    <div>
                      <p className="text-[13px] font-semibold">{t.t}</p>
                      <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">{t.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Rise>
        </section>

        {/* ── Final CTA ───────────────────────────────────────── */}
        <section className="pb-14" aria-label="Get started">
          <Rise>
            <div className="relative overflow-hidden rounded-3xl border border-[color:var(--primary)]/35 bg-[#0d0b1e]/85 px-7 py-10 text-center">
              <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[#7c5cff]/30 blur-[100px]" aria-hidden />
              <div className="relative">
                <h2 className="display mx-auto max-w-md text-xl font-bold leading-tight tracking-tight md:text-2xl">
                  Run your first file tonight
                </h2>
                <p className="mx-auto mt-2.5 max-w-md text-[13.5px] leading-6 text-muted-foreground">
                  Start with a seeded demo ledger, then swap in your own CSV. Nothing to install.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                    <Link to="/dashboard" className="edge inline-flex items-center gap-2 rounded-full border border-[color:var(--primary)]/55 bg-[#141026]/85 px-6 py-3 text-sm font-semibold text-[#c4b5fd] backdrop-blur-md transition-colors hover:bg-[#1a1333] hover:text-white">
                      Open the workspace <ArrowRight className="h-4 w-4" />
                    </Link>
                  </motion.span>
                  <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                    <Link to="/auth" className="glass inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-[color:var(--glass-border-hi)]">
                      Create an account
                    </Link>
                  </motion.span>
                </div>
              </div>
            </div>
          </Rise>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="relative border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6">
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <p className="display text-[14px] font-bold tracking-tight">Aegis</p>
            <span className="mono text-[11px] text-muted-foreground">· every transaction tells a story</span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
            <Link to="/detections" className="hover:text-foreground">Detections</Link>
            <Link to="/investigations" className="hover:text-foreground">Cases</Link>
            <Link to="/audit" className="hover:text-foreground">Audit</Link>
            <Link to="/datasets" className="hover:text-foreground">Datasets</Link>
            <Link to="/reports" className="hover:text-foreground">Reports</Link>
          </nav>
          <span className="mono inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> scores are priorities, not verdicts
          </span>
        </div>
      </footer>
    </div>
  );
}
