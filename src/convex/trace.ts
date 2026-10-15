import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("datasets").order("desc").take(100);
  },
});

export const save = mutation({
  args: {
    name: v.string(),
    source: v.string(),
    rowCount: v.number(),
    columns: v.array(v.string()),
    mapping: v.optional(v.any()),
    quality: v.optional(v.any()),
    summary: v.optional(v.any()),
    sampleRows: v.optional(v.any()),
    manifest: v.optional(v.any()),
  },
  handler: async (ctx, a) => {
    const id = await ctx.db.insert("datasets", { ...a, createdAt: Date.now() });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("datasets") },
  handler: async (ctx, a) => {
    await ctx.db.delete(a.id);
  },
});

export const listInvestigations = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("investigations").order("desc").take(100);
  },
});

export const saveInvestigation = mutation({
  args: {
    title: v.string(),
    status: v.string(),
    priority: v.string(),
    datasetId: v.optional(v.string()),
    alertIds: v.array(v.string()),
    notes: v.array(v.any()),
  },
  handler: async (ctx, a) => {
    const id = await ctx.db.insert("investigations", {
      ...a,
      ownerId: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("auditEvents", {
      actor: "analyst",
      action: "investigation.created",
      target: a.title,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const updateInvestigation = mutation({
  args: {
    id: v.id("investigations"),
    status: v.optional(v.string()),
    note: v.optional(v.any()),
  },
  handler: async (ctx, a) => {
    const cur = await ctx.db.get(a.id);
    if (!cur) throw new Error("not found");
    const notes = a.note ? [...cur.notes, a.note] : cur.notes;
    await ctx.db.patch(a.id, {
      status: a.status ?? cur.status,
      notes,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("auditEvents", {
      actor: "analyst",
      action: a.note ? "investigation.note" : "investigation.status",
      target: cur.title,
      createdAt: Date.now(),
    });
  },
});

export const auditList = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("auditEvents").order("desc").take(100);
  },
});
