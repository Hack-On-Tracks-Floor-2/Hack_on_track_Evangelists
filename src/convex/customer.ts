import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listBookings = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("bookings").order("desc").take(100)).reverse(),
});

export const createBooking = mutation({
  args: { catalogId: v.string(), catalogTitle: v.string(), date: v.string(), slot: v.string() },
  handler: async (ctx, a) => {
    const userId = await getAuthUserId(ctx);
    const u = userId ? await ctx.db.get(userId) : null;
    const id = await ctx.db.insert("bookings", {
      ...a,
      ownerId: userId ?? undefined,
      ownerEmail: u?.email ?? "guest",
      status: "confirmed",
      createdAt: Date.now(),
    });
    await ctx.db.insert("auditEvents", {
      actor: u?.email ?? "customer",
      action: "booking.created",
      target: `${a.catalogTitle} · ${a.date} ${a.slot}`,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const cancelBooking = mutation({
  args: { id: v.id("bookings") },
  handler: async (ctx, a) => {
    const cur = await ctx.db.get(a.id);
    if (!cur) throw new Error("Booking not found");
    await ctx.db.patch(a.id, { status: "cancelled" });
  },
});

export const listOrders = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("orders").order("desc").take(100)).reverse(),
});

export const createOrder = mutation({
  args: { catalogId: v.string(), catalogTitle: v.string(), amount: v.number(), currency: v.string() },
  handler: async (ctx, a) => {
    const userId = await getAuthUserId(ctx);
    const u = userId ? await ctx.db.get(userId) : null;
    const id = await ctx.db.insert("orders", {
      ...a,
      ownerId: userId ?? undefined,
      ownerEmail: u?.email ?? "guest",
      status: "paid",
      createdAt: Date.now(),
    });
    await ctx.db.insert("auditEvents", {
      actor: u?.email ?? "customer",
      action: "order.paid",
      target: `${a.catalogTitle} · ${a.amount} ${a.currency}`,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const listPosts = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("posts").order("desc").take(100),
});

export const createPost = mutation({
  args: { title: v.string(), body: v.string(), attachmentName: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const userId = await getAuthUserId(ctx);
    const u = userId ? await ctx.db.get(userId) : null;
    return await ctx.db.insert("posts", {
      ...a,
      ownerId: userId ?? undefined,
      ownerEmail: u?.email ?? "member",
      createdAt: Date.now(),
    });
  },
});

export const threadComments = query({
  args: { thread: v.string() },
  handler: async (ctx, a) =>
    await ctx.db.query("comments").withIndex("by_thread", (q) => q.eq("thread", a.thread)).order("asc").take(200),
});

export const postComment = mutation({
  args: { thread: v.string(), body: v.string() },
  handler: async (ctx, a) => {
    const userId = await getAuthUserId(ctx);
    const u = userId ? await ctx.db.get(userId) : null;
    const body = a.body.trim().slice(0, 2000);
    if (!body) throw new Error("Message is empty");
    return await ctx.db.insert("comments", {
      thread: a.thread,
      body,
      ownerId: userId ?? undefined,
      ownerEmail: u?.email ?? "member",
      createdAt: Date.now(),
    });
  },
});

export const adminOverview = query({
  args: {},
  handler: async (ctx) => ({
    bookings: await ctx.db.query("bookings").order("desc").take(100),
    orders: await ctx.db.query("orders").order("desc").take(100),
    posts: await ctx.db.query("posts").order("desc").take(100),
    datasets: await ctx.db.query("datasets").order("desc").take(100),
    investigations: await ctx.db.query("investigations").order("desc").take(100),
    audit: await ctx.db.query("auditEvents").order("desc").take(50),
  }),
});
