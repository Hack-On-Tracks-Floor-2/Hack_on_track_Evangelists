// Fraud reasoning simulation — a cinematic, evidence-driven walkthrough of WHY
// an entity was flagged: animated reasoning pipeline, radial entity mapping and
// a flagged-transfer timeline. Every number comes from the stored alert and the
// dataset transfers it cites; nothing is invented.
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Pause, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { simulateEntity, type EntitySim } from "@/lib/trace/simulate";
import type { Dataset } from "@/lib/trace/store";
import { fmtAxis, shortId } from "./ui";

const SEV_COLOR: Record<string, string> = {
  critical: "#f05252", high: "#f4b544", medium: "#5b8cff", low: "#26c6b8",
};

function Gauge({ score, color }: { score: number; color: string }) {
  const r = 27, circ = 2 * Math.PI * r;
  return (
    <div className="relative h-[74px] w-[74px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <motion.circle
          cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (circ * Math.min(100, Math.max(0, score))) / 100 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum text-lg font-extrabold leading-none">{Math.round(score)}</span>
        <span className="mono text-[8px] uppercase tracking-wider text-muted-foreground">score</span>
      </div>
    </div>
  );
}

export function FraudSim({ ds, entityId, onClose }: { ds: Dataset; entityId: string; onClose: () => void }) {
  const sims = useMemo(() => simulateEntity(entityId, ds.txns, ds.alerts), [ds, entityId]);
  const [simIdx, setSimIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const sim: EntitySim | undefined = sims[Math.min(simIdx, Math.max(0, sims.length - 1))];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (!sim || !playing || step >= sim.steps.length) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { const t = setTimeout(() => setStep(sim.steps.length), 0); return () => clearTimeout(t); }
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 450 : 820);
    return () => clearTimeout(t);
  }, [sim, step, playing]);

  // Entity activity, flagged subset and radial mapping — all from the dataset.
  const { tx, flaggedIds, flaggedTx, peers: peerRows, topCcy } = useMemo(() => {
    const tx = ds.txns
      .filter((t) => t.sender === entityId || t.receiver === entityId)
      .sort((a, b) => a.epoch - b.epoch);
    const flaggedIds = new Set((sim?.trail ?? []).map((t) => t.id));
    const flaggedTx = (sim?.trail ?? []);
    const peerMap = new Map<string, { n: number; imp: boolean }>();
    tx.forEach((t) => {
      const p = t.sender === entityId ? t.receiver : t.sender;
      const e = peerMap.get(p) ?? { n: 0, imp: false };
      e.n++;
      if (flaggedIds.has(t.id)) e.imp = true;
      peerMap.set(p, e);
    });
    const ccy = new Map<string, number>();
    flaggedTx.forEach((t) => ccy.set(t.currency, (ccy.get(t.currency) ?? 0) + t.amount));
    const topCcy = [...ccy.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    const peers = [...peerMap.entries()]
      .sort((a, b) => (Number(b[1].imp) - Number(a[1].imp)) || b[1].n - a[1].n)
      .slice(0, 8)
      .map(([id, e], i, arr) => {
        const ang = (i / Math.max(1, arr.length)) * Math.PI * 2 - Math.PI / 2;
        return { id, ...e, x: 190 + Math.cos(ang) * 96, y: 118 + Math.sin(ang) * 74 };
      });
    return { tx, flaggedIds, flaggedTx, peers, topCcy };
  }, [ds, entityId, sim]);

  const timeline = useMemo(() => {
    const norm = tx.filter((t) => !flaggedIds.has(t.id)).map((t) => ({ x: t.epoch, y: t.amount, id: t.id }));
    const hot = tx.filter((t) => flaggedIds.has(t.id)).map((t) => ({ x: t.epoch, y: t.amount, id: t.id }));
    return { norm, hot };
  }, [tx, flaggedIds]);

  const sevColor = SEV_COLOR[sim?.severity ?? "low"] ?? SEV_COLOR.low;
  const totalSteps = sim?.steps.length ?? 0;
  const progress = totalSteps ? Math.round((Math.min(step, totalSteps) / totalSteps) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6" role="dialog" aria-modal="true" aria-label={`Fraud reasoning simulation for ${entityId}`}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="thin-scroll relative flex h-full max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-[color:var(--elevated)] shadow-2xl"
      >
        {/* header */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border" style={{ background: `${sevColor}1a` }}>
            <span className="text-[15px] font-black" style={{ color: sevColor }}>⚑</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">fraud reasoning simulation</p>
            <p className="truncate text-[15px] font-bold tracking-tight" title={entityId}>{shortId(entityId)}</p>
          </div>
          {sim && (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="mono rounded border px-2 py-0.5 text-[10px] text-muted-foreground">{sim.ruleId} · {sim.category}</span>
              <span className="rounded border px-2 py-0.5 text-[11px] font-semibold capitalize" style={{ color: sevColor, borderColor: `${sevColor}4d`, background: `${sevColor}14` }}>{sim.severity}</span>
            </div>
          )}
          {sim && <Gauge score={sim.score} color={sevColor} />}
          <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close simulation"><X className="h-4 w-4" /></button>
        </div>

        {/* sim selector + replay controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {sims.map((s, i) => (
              <button key={s.alertId} onClick={() => { setSimIdx(i); setStep(0); setPlaying(true); }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${i === simIdx ? "border-transparent text-white" : "border-border text-muted-foreground hover:text-foreground"}`}
                style={i === simIdx ? { background: SEV_COLOR[s.severity] ?? SEV_COLOR.low } : undefined}>
                {s.ruleName} · {Math.round(s.score)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="mono mr-1 text-[11px] text-muted-foreground">step {Math.min(step, totalSteps)}/{totalSteps}</span>
            <button onClick={() => setPlaying((p) => !p)} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted" aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="inline h-3 w-3" /> : <Play className="inline h-3 w-3" />} {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => { setStep(0); setPlaying(true); }} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
              <RotateCcw className="inline h-3 w-3" /> Replay
            </button>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full" style={{ background: sevColor }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
          </div>
        </div>

        {!sim ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
            <p className="text-sm font-semibold">No detector flagged this entity</p>
            <p className="max-w-md text-[13px] text-muted-foreground">Every number in this simulation comes from stored detector output. When no rule matches an account, nothing is shown here — absence of alerts is not proof of legitimacy.</p>
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[1.05fr_1fr] lg:overflow-hidden">
            {/* left: reasoning pipeline */}
            <div className="thin-scroll space-y-2.5 overflow-y-auto border-b border-border p-5 lg:border-b-0 lg:border-r">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reasoning pipeline — replayed from detector output</p>
              <AnimatePresence initial={false}>
                {sim.steps.map((st, i) => {
                  if (i > step) return null;
                  const current = i === step;
                  const done = i < step;
                  return (
                    <motion.div key={i}
                      initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.32 }}
                      className={`relative flex gap-3 rounded-xl border p-3.5 ${current ? "border-transparent bg-background/70" : "border-border/60 bg-background/40"}`}
                      style={current ? { boxShadow: `0 0 0 1px ${sevColor}55, 0 8px 30px ${sevColor}18` } : undefined}
                    >
                      <div className="flex flex-col items-center">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold"
                          style={done ? { background: "var(--success)", borderColor: "var(--success)", color: "#04231a" }
                            : current ? { borderColor: sevColor, color: sevColor, background: `${sevColor}1a` }
                            : { borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                        </span>
                        {i < sim.steps.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold leading-5">{st.title}</p>
                        <p className="mt-1 break-words text-[13px] leading-6 text-muted-foreground">{st.detail}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {step >= totalSteps && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-xl border border-border bg-background/50 p-3.5">
                  <p className="text-[13px] font-semibold">Verdict for review</p>
                  <p className="mt-1 text-[13px] leading-6 text-muted-foreground">This simulation replays exactly what the detector measured — open the full alert workbench for the complete evidence pack, review actions and analyst notes.</p>
                </motion.div>
              )}
            </div>

            {/* right: mapping + timeline */}
            <div className="thin-scroll space-y-4 overflow-y-auto p-5">
              {/* metric tiles */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  ["Transfers examined", tx.length.toLocaleString("en-IN")],
                  ["Implicated", flaggedTx.length.toLocaleString("en-IN")],
                  ["Counterparties", peerRows.length.toLocaleString("en-IN")],
                  ["Flagged value", topCcy ? `${Math.round(topCcy[1]).toLocaleString("en-IN")} ${topCcy[0]}` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border bg-background/50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
                    <p className="tnum mt-0.5 truncate text-sm font-bold" title={v}>{v}</p>
                  </div>
                ))}
              </div>

              {/* radial mapping */}
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entity mapping</p>
                <svg viewBox="0 0 380 236" className="mt-1 w-full" role="img" aria-label="Entity counterparty mapping">
                  <defs>
                    <radialGradient id="fsGlow">
                      <stop offset="0%" stopColor={sevColor} stopOpacity="0.45" />
                      <stop offset="100%" stopColor={sevColor} stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <circle cx="190" cy="118" r="60" fill="url(#fsGlow)" />
                  {peerRows.length === 0 && <text x="190" y="124" textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">no counterparties in dataset</text>}
                  {peerRows.map((p, i) => {
                    const lit = step >= 2 && p.imp;
                    return (
                      <g key={p.id}>
                        <motion.line x1="190" y1="118" x2={p.x} y2={p.y}
                          stroke={lit ? SEV_COLOR.high : "var(--border)"} strokeWidth={lit ? 2 : 1.2}
                          strokeDasharray={lit ? "5 4" : undefined}
                          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: lit ? 1 : 0.7 }}
                          transition={{ duration: 0.5, delay: 0.05 * i }} />
                        <motion.g initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + 0.05 * i }}>
                          <circle cx={p.x} cy={p.y} r={lit ? 9 : 6.5}
                            fill={lit ? SEV_COLOR.high : "var(--muted)"} stroke={lit ? "#0a0f18" : "var(--border)"} strokeWidth="1.5" />
                          <text x={p.x} y={p.y + (p.y < 118 ? -14 : 20)} textAnchor="middle"
                            fill={lit ? SEV_COLOR.high : "var(--muted-foreground)"} fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                            {shortId(p.id).slice(0, 18)}
                          </text>
                        </motion.g>
                      </g>
                    );
                  })}
                  {peerRows.length > 0 && (
                    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
                      <circle cx="190" cy="118" r="17" fill={sevColor} stroke="#0a0f18" strokeWidth="2" />
                      <text x="190" y="122" textAnchor="middle" fill="#0a0f18" fontSize="10" fontWeight="800">YOU</text>
                      <text x="190" y="152" textAnchor="middle" fill="var(--foreground)" fontSize="10.5" fontFamily="JetBrains Mono, monospace">
                        {shortId(entityId).slice(0, 26)}
                      </text>
                    </motion.g>
                  )}
                </svg>
                <p className="mono mt-1 text-[10px] text-muted-foreground">amber = counterparties on implicated transfers · edges appear as the pipeline replays</p>
              </div>

              {/* flagged-transfer timeline */}
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transfer timeline ({tx.length})</p>
                <div className="mt-1 h-[168px]">
                  {tx.length > 0 ? (
                    <ResponsiveContainer>
                      <ScatterChart margin={{ top: 6, right: 10, bottom: 4, left: 0 }}>
                        <CartesianGrid stroke="var(--border)" vertical={false} />
                        <XAxis type="number" dataKey="x" name="time" scale="time" domain={["dataMin", "dataMax"]}
                          tickFormatter={(v: number) => new Date(v).toISOString().slice(5, 10)}
                          tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                        <YAxis type="number" dataKey="y" name="amount" tickFormatter={fmtAxis}
                          tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} width={44} stroke="var(--border)" />
                        <ZAxis range={[24, 24]} />
                        <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                          formatter={(v, n) => [n === "amount" ? Number(v ?? 0).toLocaleString("en-IN") : new Date(Number(v ?? 0)).toLocaleString(), n === "amount" ? "Amount" : "Time"]}
                          labelFormatter={() => ""}
                          cursor={{ strokeDasharray: "3 3" }} />
                        <Scatter data={timeline.norm} fill="var(--muted-foreground)" fillOpacity={0.45} />
                        {step >= 3 && <Scatter data={timeline.hot} fill={SEV_COLOR.high} stroke="#0a0f18" strokeOpacity={0.5} />}
                      </ScatterChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="flex h-full items-center justify-center text-[13px] text-muted-foreground">No transfers reference this entity.</p>
                  )}
                </div>
                <p className="mono mt-1 text-[10px] text-muted-foreground">grey = all transfers · amber = transfers cited by the detector</p>
              </div>

              {/* implicated transfer trail */}
              {step >= 2 && flaggedTx.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-background/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Implicated transfers ({flaggedTx.length})</p>
                  <div className="mono mt-1.5 max-h-40 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
                    {flaggedTx.slice(0, 12).map((t) => (
                      <p key={t.id} className="truncate" title={`${t.sender} → ${t.receiver}`}>
                        <span style={{ color: SEV_COLOR.high }}>{t.id}</span> · {shortId(t.sender)} → {shortId(t.receiver)} · {t.amount.toLocaleString("en-IN")} {t.currency} · {t.timestamp.slice(0, 16).replace("T", " ")}
                      </p>
                    ))}
                    {flaggedTx.length > 12 && <p>…and {flaggedTx.length - 12} more — full list in the alert workbench.</p>}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        )}

        {/* footer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-2.5 text-[11px] text-muted-foreground">
          <span>Scores rank review order — they are not probabilities of wrongdoing. Every alert needs human review.</span>
          {sim && (
            <a href={`/detections/${sim.alertId}`} className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs font-medium text-[color:var(--primary)] hover:bg-muted">Open full workbench →</a>
          )}
        </div>
      </motion.div>
    </div>
  );
}
