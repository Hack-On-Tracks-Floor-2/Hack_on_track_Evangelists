// Shared review state: Convex backend is the source of truth so reviewers on
// different computers see each other's statuses and notes. localStorage mirrors
// every write for instant UI and offline visibility, and is merged underneath
// backend rows on read. Every backend write also lands in the audit trail.
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";

export type Review = "new" | "reviewing" | "reviewed" | "false-positive" | "escalated";
export interface ReviewNote { at: string; text: string; actor?: string; }

const RKEY = "trace.v1.reviews";
const NKEY = "trace.v1.alertnotes";

// In-memory layer: guarantees review actions always take effect visibly, even if
// the browser's localStorage quota is exhausted by large datasets.
const memReviews = new Map<string, Review>();
const memNotes = new Map<string, ReviewNote[]>();

function localReviews(): Record<string, Review> {
  try { return JSON.parse(localStorage.getItem(RKEY) ?? "{}"); } catch { return {}; }
}
function localNotes(): Record<string, ReviewNote[]> {
  try { return JSON.parse(localStorage.getItem(NKEY) ?? "{}"); } catch { return {}; }
}
function writeLocalReviews(r: Record<string, Review>) {
  try { localStorage.setItem(RKEY, JSON.stringify(r)); } catch { /* quota — backend still persists */ }
}
function writeLocalNotes(n: Record<string, ReviewNote[]>) {
  try { localStorage.setItem(NKEY, JSON.stringify(n)); } catch { /* quota — backend still persists */ }
}

function withTimeout<T>(p: Promise<T>, ms = 9000): Promise<T | null> {
  return Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), ms))]);
}

export function useReviewStore() {
  const remote = useQuery(api.trace.listAlertReviews);
  const save = useMutation(api.trace.saveAlertReview);
  // Reconnect backfill: anything recorded while the backend was unreachable
  // (localStorage + memory) is pushed up the moment the backend answers
  // again, so "saved on this device" reviews actually sync. Keys already
  // present remotely are never re-sent.
  const pushed = useRef(new Set<string>());
  useEffect(() => {
    if (remote === undefined) return;
    const rows = remote as { key: string; status: string; notes: ReviewNote[] }[];
    const have = new Map(rows.map((r) => [r.key, r]));
    const put = (pkey: string, key: string, status?: Review, note?: ReviewNote) => {
      if (pushed.current.has(pkey)) return;
      pushed.current.add(pkey);
      save({ key, status, note, actor: note?.actor ?? "reconnect-sync" }).catch(() => { pushed.current.delete(pkey); });
    };
    const lr = localReviews();
    const keys = new Set<string>([...Object.keys(lr), ...memReviews.keys(), ...Object.keys(localNotes()), ...memNotes.keys()]);
    keys.forEach((key) => {
      if (!have.has(key)) {
        const status = memReviews.get(key) ?? lr[key];
        if (status) put(`s:${key}`, key, status);
      }
      const seen = new Set(((have.get(key)?.notes ?? []) as ReviewNote[]).map((n) => `${n.at}|${n.text}`));
      [...(localNotes()[key] ?? []), ...(memNotes.get(key) ?? [])].forEach((n) => {
        if (!seen.has(`${n.at}|${n.text}`)) put(`n:${key}:${n.at}|${n.text}`, key, undefined, n);
      });
    });
  }, [remote, save]);
  return useMemo(() => {
    const map = new Map(
      ((remote ?? []) as { key: string; status: string; notes: ReviewNote[] }[]).map((r) => [r.key, r]),
    );
    const statusOf = (key: string): Review =>
      (map.get(key)?.status as Review) ?? localReviews()[key] ?? memReviews.get(key) ?? "new";
    const statusMap = (): Record<string, Review> => {
      const o: Record<string, Review> = { ...localReviews() };
      map.forEach((r, k) => { o[k] = r.status as Review; });
      return o;
    };
    const notesOf = (key: string): ReviewNote[] => {
      const rn = (map.get(key)?.notes ?? []) as ReviewNote[];
      const ln = localNotes()[key] ?? [];
      const mn = memNotes.get(key) ?? [];
      const seen = new Set(rn.map((n) => n.at + "|" + n.text));
      const extra = [...ln, ...mn].filter((n) => !seen.has(n.at + "|" + n.text));
      extra.forEach((n) => seen.add(n.at + "|" + n.text));
      return [...rn, ...extra].sort((a, b) => a.at.localeCompare(b.at));
    };
    const setStatus = async (key: string, status: Review, actor: string): Promise<boolean> => {
      memReviews.set(key, status);
      const r = localReviews();
      r[key] = status;
      writeLocalReviews(r);
      try { return (await withTimeout(save({ key, status, actor }))) !== null; } catch { return false; }
    };
    const addNote = async (key: string, text: string, actor: string): Promise<boolean> => {
      const note = { at: new Date().toISOString(), text, actor };
      memNotes.set(key, [...(memNotes.get(key) ?? []), note]);
      const n = localNotes();
      n[key] = [...(n[key] ?? []), note];
      writeLocalNotes(n);
      try { return (await withTimeout(save({ key, note, actor }))) !== null; } catch { return false; }
    };
    return { statusOf, statusMap, notesOf, setStatus, addNote, shared: remote !== undefined };
  }, [remote, save]);
}
