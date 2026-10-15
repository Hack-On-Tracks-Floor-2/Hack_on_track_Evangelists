import { Card } from "@/components/app/Shell";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { ImagePlus, MessageCircle, Send } from "lucide-react";
import { useState } from "react";

export function Community() {
  const posts = useQuery(api.customer.listPosts) ?? [];
  const create = useMutation(api.customer.createPost);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function publish() {
    if (!title.trim() || !body.trim()) { alert("Give your post a title and a few words first."); return; }
    await create({ title: title.trim(), body: body.trim(), attachmentName: file || undefined });
    setTitle(""); setBody(""); setFile("");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="h-fit p-5">
        <p className="text-sm font-semibold">Share something useful</p>
        <p className="mt-0.5 text-[13px] text-neutral-500">Post a question, a win, or your own data for feedback.</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A title people will click…" className="mt-3 w-full rounded border border-neutral-200 px-2.5 py-2 text-[13px]" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="What is going on? What have you tried?" className="mt-2 w-full rounded border border-neutral-200 p-2.5 text-[13px] leading-6" />
        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-neutral-300 p-3 text-[13px] text-neutral-500 hover:bg-neutral-50">
          <ImagePlus className="h-4 w-4" />
          <span className="truncate">{file || "Attach a file (CSV, screenshot…)"}</span>
          <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0]?.name ?? "")} />
        </label>
        <button onClick={publish} className="mt-3 w-full rounded-lg bg-gradient-to-r from-indigo-600 to-pink-500 px-4 py-2 text-sm font-semibold text-white">Publish post</button>
      </Card>
      <div className="space-y-3 lg:col-span-2">
        {posts.map((p) => (
          <Card key={p._id} className="p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 text-xs font-bold text-white">
                {(p.ownerEmail ?? "?")[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{p.title}</p>
                <p className="font-mono text-[11px] text-neutral-400">{p.ownerEmail} · {new Date(p.createdAt).toLocaleString()}{p.attachmentName ? ` · 📎 ${p.attachmentName}` : ""}</p>
              </div>
              <button onClick={() => setOpen(open === p._id ? null : p._id)} className="ml-auto inline-flex items-center gap-1 rounded border border-neutral-200 px-2.5 py-1 text-xs">
                <MessageCircle className="h-3 w-3" /> Discuss
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-6 text-neutral-600">{p.body}</p>
            {open === p._id && <Thread thread={`post:${p._id}`} />}
          </Card>
        ))}
        {posts.length === 0 && <Card className="p-10 text-center text-sm text-neutral-400">Quiet in here. Be the friendly first voice.</Card>}
      </div>
    </div>
  );
}

export function Thread({ thread }: { thread: string }) {
  const comments = useQuery(api.customer.threadComments, { thread }) ?? [];
  const send = useMutation(api.customer.postComment);
  const [draft, setDraft] = useState("");
  return (
    <div className="mt-3 border-t border-neutral-100 pt-3">
      <div className="max-h-56 space-y-2 overflow-auto">
        {comments.map((c) => (
          <div key={c._id} className="rounded-lg bg-neutral-50 p-2.5 text-[13px]">
            <p>{c.body}</p>
            <p className="mt-0.5 font-mono text-[11px] text-neutral-400">{c.ownerEmail} · {new Date(c.createdAt).toLocaleString()}</p>
          </div>
        ))}
        {comments.length === 0 && <p className="text-[13px] text-neutral-400">No messages yet — say hello.</p>}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" className="flex-1 rounded border border-neutral-200 px-2.5 py-1.5 text-[13px]" onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { send({ thread, body: draft.trim() }); setDraft(""); } }} />
        <button onClick={async () => { if (draft.trim()) { await send({ thread, body: draft.trim() }); setDraft(""); } }} className="rounded bg-neutral-900 px-3 py-1.5 text-white"><Send className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
