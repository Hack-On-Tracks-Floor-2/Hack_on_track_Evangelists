import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, BellRing, FileUp, FlaskConical, Landmark, Network, ShieldAlert, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "@/components/app/Logo";

const EASE = [0.22, 1, 0.36, 1] as const;

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

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const t0 = performance.now();
    const dur = 1400;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);
  return (
    <span ref={ref} className="tnum">
      {n.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}

/** Animated transaction network: pulsing nodes, flowing dashed edges. */
function NetworkArt() {
  const nodes = [
    { x: 60, y: 70, r: 7 }, { x: 150, y: 40, r: 5 }, { x: 240, y: 80, r: 9 },
    { x: 120, y: 140, r: 6 }, { x: 220, y: 160, r: 5 }, { x: 300, y: 120, r: 7 },
  ];
  const edges = [[0, 1], [1, 2], [0, 3], [3, 4], [4, 2], [2, 5], [3, 1]];
  return (
    <svg viewBox="0 0 360 200" className="h-full w-full" role="img" aria-label="Animated transaction network">
      {edges.map(([a, b], i) => (
        <motion.line
          key={i}
          x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
          stroke={i === 4 ? "#F4B544" : "#5B8CFF"}
          strokeWidth={i === 4 ? 2 : 1.2}
          strokeDasharray="5 5"
          opacity={0.65}
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: -40 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear", delay: i * 0.2 }}
        />
      ))}
      {nodes.map((nd, i) => (
        <g key={i}>
          <motion.circle
            cx={nd.x} cy={nd.y} r={nd.r + 7}
            fill="none" stroke={i === 2 ? "#F4B544" : "#26C6B8"} strokeWidth={1} opacity={0.4}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: [0.7, 1.15, 0.7], opacity: [0, 0.5, 0] }}
            transition={{ duration: 3, repeat: Infinity, delay: i * 0.45 }}
            style={{ transformOrigin: `${nd.x}px ${nd.y}px` }}
          />
          <circle cx={nd.x} cy={nd.y} r={nd.r} fill={i === 2 ? "#F4B544" : "#0D1420"} stroke={i === 2 ? "#F4B544" : "#5B8CFF"} strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  );
}

function Tilt({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [5, -5]), { stiffness: 200, damping: 22 });
  const ry = useSpring(useTransform(mx, [0, 1], [-5, 5]), { stiffness: 200, damping: 22 });
  return (
    <motion.div
      ref={ref}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        mx.set((e.clientX - r.left) / r.width);
        my.set((e.clientY - r.top) / r.height);
      }}
      onMouseLeave={() => { mx.set(0.5); my.set(0.5); }}
    >
      {children}
    </motion.div>
  );
}

const CAPS = [
  { icon: FileUp, t: "Any CSV, understood", d: "Unfamiliar columns, messy dates, mixed currencies — mapped with confidence scores, never silent guesses." },
  { icon: ShieldAlert, t: "Explainable detection", d: "Splitting, velocity, pass-through, cycles, plus a freshly trained isolation-forest model. Every alert cites transaction IDs." },
  { icon: Network, t: "Relationship graphs", d: "Cytoscape-powered tracing across accounts, hubs, and circular routes — no invented identities." },
  { icon: Landmark, t: "Real FX intelligence", d: "Live provider quotes and ECB reference history with honest freshness states. Never fabricated ticks." },
  { icon: FlaskConical, t: "Synthetic studio", d: "Seeded ledgers with planted scenarios and isolated ground truth for safe evaluation." },
  { icon: BellRing, t: "Review workflow", d: "Cases, notes, audit trail, and notifications that say plainly what is — and isn't — model-confirmed." },
];

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      {/* ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <motion.div className="absolute -top-40 left-1/4 h-[28rem] w-[28rem] rounded-full bg-[color:var(--primary)]/15 blur-[130px]"
          animate={{ x: [0, 60, 0], y: [0, 30, 0] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute right-[8%] top-1/3 h-[22rem] w-[22rem] rounded-full bg-[color:var(--teal)]/10 blur-[120px]"
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }} transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }} />
      </div>

      <header className="relative border-b border-border/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Logo size={46} />
            <div className="leading-tight">
              <p className="text-[20px] font-extrabold tracking-tight">Aegis</p>
              <p className="mono text-[11px] tracking-wide text-muted-foreground">connect the evidence</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/auth" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">Sign in</Link>
            <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link to="/dashboard" className="rounded-md bg-[color:var(--primary)] px-4 py-2 text-sm font-semibold text-white">Open workspace</Link>
            </motion.span>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-5">
        {/* hero */}
        <section className="grid items-center gap-10 py-14 md:py-20 lg:grid-cols-2">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
            >
              <Sparkles className="h-3 w-3 text-[color:var(--teal)]" /> rules + trained ML + graph evidence
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
              className="mt-5 text-4xl font-extrabold leading-[1.06] tracking-tight md:text-[3.4rem]"
            >
              Every transaction tells a story.{" "}
              <span className="bg-gradient-to-r from-[color:var(--primary)] to-[color:var(--teal)] bg-clip-text text-transparent">
                Connect the evidence.
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.16, ease: EASE }}
              className="mt-5 max-w-lg text-[15px] leading-7 text-muted-foreground"
            >
              Aegis analyses Indian domestic transfers and international payments, watches live FX,
              and turns any messy CSV into explainable, review-ready alerts — with honesty about
              what the machine confirms and what it does not.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.24, ease: EASE }}
              className="mt-7 flex flex-wrap gap-3"
            >
              <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[color:var(--primary)]/25">
                  Start investigating <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.span>
              <motion.span whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Link to="/datasets" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-muted">
                  Upload your CSV
                </Link>
              </motion.span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.8 }}
              className="tnum mt-8 flex gap-8 text-sm"
            >
              <div><p className="text-2xl font-extrabold"><Counter to={8} /></p><p className="text-xs text-muted-foreground">detection rules</p></div>
              <div><p className="text-2xl font-extrabold"><Counter to={150} suffix="+" /></p><p className="text-xs text-muted-foreground">ML trees trained</p></div>
              <div><p className="text-2xl font-extrabold"><Counter to={12} /></p><p className="text-xs text-muted-foreground">FX pairs tracked</p></div>
            </motion.div>
          </div>
          <Tilt>
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
              className="rounded-xl border border-border bg-card/80 p-4 shadow-2xl backdrop-blur"
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="mono text-[11px] text-muted-foreground">live trace · entity network</p>
                <p className="mono flex items-center gap-1.5 text-[11px] text-[color:var(--success)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--success)]" /> streaming</p>
              </div>
              <div className="h-56"><NetworkArt /></div>
              <div className="tnum mt-2 grid grid-cols-3 gap-2 text-center">
                {[["2.4k", "transfers"], ["37", "entities"], ["6", "review signals"]].map(([a, b]) => (
                  <div key={b} className="rounded-md border border-border bg-background px-2 py-2">
                    <p className="text-sm font-bold">{a}</p><p className="text-[10px] text-muted-foreground">{b}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </Tilt>
        </section>

        {/* marquee */}
        <div className="overflow-hidden border-y border-border/70 py-3" aria-hidden>
          <motion.div
            className="mono flex w-max gap-10 text-xs text-muted-foreground"
            animate={{ x: ["0%", "-50%"] }} transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
          >
            {Array.from({ length: 2 }).flatMap((_, k) =>
              ["splitting detection", "isolation-forest anomalies", "pass-through tracing", "circular routes", "fan-in / fan-out", "corridor analysis", "evidence packs", "audit trail"].map((t) => (
                <span key={k + t} className="flex items-center gap-10"><span>{t}</span><span className="text-[color:var(--teal)]">◆</span></span>
              )),
            )}
          </motion.div>
        </div>

        {/* capabilities */}
        <section className="py-14">
          <Rise><h2 className="text-xl font-bold tracking-tight">One workspace, six crafts</h2></Rise>
          <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {CAPS.map((c, i) => (
              <Rise key={c.t} delay={(i % 3) * 0.08}>
                <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className="h-full rounded-xl border border-border bg-card p-5">
                  <c.icon className="h-5 w-5 text-[color:var(--primary)]" strokeWidth={1.75} />
                  <p className="mt-3 text-sm font-semibold">{c.t}</p>
                  <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{c.d}</p>
                </motion.div>
              </Rise>
            ))}
          </div>
        </section>

        {/* honesty band */}
        <Rise>
          <section className="mb-14 rounded-xl border border-[color:var(--primary)]/30 bg-[color:var(--primary)]/5 p-6 md:p-8">
            <h2 className="text-lg font-bold tracking-tight">Honest by design</h2>
            <div className="mt-3 grid gap-4 text-[13px] leading-6 text-muted-foreground md:grid-cols-3">
              <p><span className="font-semibold text-foreground">Scores are priorities,</span> not probabilities of crime. Country, channel, or amount alone never decide an alert.</p>
              <p><span className="font-semibold text-foreground">ML ranks unusualness.</span> A freshly trained isolation forest flags outliers — it does not confirm wrongdoing.</p>
              <p><span className="font-semibold text-foreground">FX states are labelled.</span> Live, delayed, cached, reference, or unavailable — never invented ticks.</p>
            </div>
            <Link to="/dashboard" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[color:var(--primary)] px-5 py-2.5 text-sm font-semibold text-white">
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
