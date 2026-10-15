import { motion } from "framer-motion";
import { ArrowRight, BellRing, FileUp, FlaskConical, Landmark, Network, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "@/components/app/Logo";

const EASE = [0.22, 1, 0.36, 1] as const;

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104036_bd6924f6-3c8e-417e-8465-6d03c8c2e9e6.mp4";

function Rise({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const CAPS = [
  { icon: FileUp, t: "Any CSV, understood", d: "Unfamiliar columns, messy dates, mixed currencies — mapped with confidence scores, never silent guesses." },
  { icon: ShieldAlert, t: "Explainable detection", d: "Splitting, velocity, pass-through, cycles, plus a freshly trained isolation-forest model. Every alert cites transaction IDs." },
  { icon: Network, t: "Relationship graphs", d: "Cytoscape-powered tracing across accounts, hubs, and circular routes — no invented identities." },
  { icon: Landmark, t: "Corridor analysis", d: "Domestic versus cross-border flows, intermediary chains, and counterparty context — a country alone never decides an alert." },
  { icon: FlaskConical, t: "Labelled demo data", d: "Seeded ledgers with planted scenarios and isolated ground truth for safe evaluation." },
  { icon: BellRing, t: "Review workflow", d: "Cases, notes, audit trail, and notifications that say plainly what is — and isn't — model-confirmed." },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#070611] font-sans text-foreground antialiased">
      {/* full-page video background, tinted to match the Aegis color scheme */}
      <video
        className="pointer-events-none fixed inset-0 h-full w-full object-cover"
        src={HERO_VIDEO}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 bg-black/35" aria-hidden />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-black/70 via-transparent to-[#070611]" aria-hidden />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(125%_95%_at_50%_42%,transparent_0%,rgba(7,6,17,0.74)_100%)]" aria-hidden />
      {/* ambient glow — violet to echo the globe in the video */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <motion.div className="absolute -top-40 left-1/4 h-[28rem] w-[28rem] rounded-full bg-[#7c5cff]/20 blur-[130px]"
          animate={{ x: [0, 60, 0], y: [0, 30, 0] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute right-[8%] top-1/3 h-[22rem] w-[22rem] rounded-full bg-[color:var(--primary)]/14 blur-[120px]"
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }} transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }} />
      </div>

      <header className="relative border-b border-border/60 bg-[#070611]/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="group flex items-center gap-3">
            <span className="transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3"><Logo size={42} /></span>
            <div className="leading-tight">
              <p className="display text-[20px] font-bold tracking-tight">Aegis</p>
              <p className="mono text-[10px] tracking-wide text-muted-foreground">connect the evidence</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/auth" className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground">Sign in</Link>
            <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link to="/dashboard" className="grad-bg inline-block rounded-full px-4.5 py-2 text-sm font-semibold text-white shadow-[0_8px_28px_-10px_rgba(139,92,246,0.9)]">Open workspace</Link>
            </motion.span>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-5">
        {/* hero with video background */}
        <section className="relative" aria-label="Aegis introduction">
          <div className="relative mx-auto max-w-3xl px-5 py-32 text-center md:py-48">
            <motion.h1
              initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
              className="display text-4xl font-bold leading-[1.06] tracking-tight md:text-[3.4rem]"
            >
              Every transaction tells a story.{" "}
              <span className="bg-gradient-to-r from-[#c4b5fd] via-[#a78bfa] to-[#f472b6] bg-[length:200%_auto] bg-clip-text text-transparent">
                Connect the evidence.
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.16, ease: EASE }}
              className="mx-auto mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground"
            >
              Aegis analyses Indian domestic transfers and international payments,
              turning any messy CSV into explainable, review-ready alerts — with honesty about
              what the machine confirms and what it does not.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.24, ease: EASE }}
              className="mt-7 flex flex-wrap justify-center gap-3"
            >
              <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Link to="/dashboard" className="grad-bg inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_40px_-12px_rgba(236,72,153,0.7)]">
                  Start investigating <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.span>
              <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Link to="/datasets" className="glass inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-[color:var(--glass-border-hi)]">
                  Upload your CSV
                </Link>
              </motion.span>
            </motion.div>
          </div>
        </section>

        {/* capabilities */}
        <section className="py-14">
          <Rise><h2 className="display text-xl font-bold tracking-tight">One workspace, six crafts</h2></Rise>
          <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {CAPS.map((c, i) => (
              <Rise key={c.t} delay={(i % 3) * 0.08}>
                <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className="glass group h-full rounded-2xl p-5">
                  <div className="grad-bg flex h-9 w-9 items-center justify-center rounded-xl p-px shadow-[0_8px_24px_-10px_rgba(139,92,246,0.8)] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                    <span className="flex h-full w-full items-center justify-center rounded-[10px] bg-[#0b0a1a]/80">
                      <c.icon className="h-4 w-4 text-[#c4b5fd]" strokeWidth={1.75} />
                    </span>
                  </div>
                  <p className="display mt-3.5 text-sm font-semibold">{c.t}</p>
                  <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{c.d}</p>
                </motion.div>
              </Rise>
            ))}
          </div>
        </section>

        {/* honesty band */}
        <Rise>
          <section className="glass mb-14 rounded-3xl border border-[color:var(--primary)]/25 bg-gradient-to-br from-[color:var(--primary)]/12 via-transparent to-[#ec4899]/8 p-7 md:p-9">
            <h2 className="display text-lg font-bold tracking-tight">Honest by design</h2>
            <div className="mt-4 grid gap-5 text-[13px] leading-6 text-muted-foreground md:grid-cols-3">
              <p><span className="font-semibold text-foreground">Scores are priorities,</span> not probabilities of crime. Country, channel, or amount alone never decide an alert.</p>
              <p><span className="font-semibold text-foreground">ML ranks unusualness.</span> A freshly trained isolation forest flags outliers — it does not confirm wrongdoing.</p>
              <p><span className="font-semibold text-foreground">Missing data is labelled.</span> Gaps, weak baselines, and currency-aware totals are shown — never hidden or silently filled.</p>
            </div>
            <Link to="/dashboard" className="grad-bg mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_34px_-12px_rgba(236,72,153,0.8)]">
              Enter the workspace <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </Rise>
      </main>

      <footer className="relative border-t border-border/70">
        <div className="mono mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-5 text-[11px] text-muted-foreground">
          <span>Aegis · every transaction tells a story</span>
          <Link to="/dashboard" className="hover:text-foreground">back to workspace ↑</Link>
        </div>
      </footer>
    </div>
  );
}
