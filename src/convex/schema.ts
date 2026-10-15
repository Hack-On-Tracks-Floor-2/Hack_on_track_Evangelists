import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    datasets: defineTable({
      ownerId: v.optional(v.string()),
      name: v.string(),
      source: v.string(), // "upload" | "synthetic" | "demo"
      rowCount: v.number(),
      columns: v.array(v.string()),
      mapping: v.optional(v.any()),
      quality: v.optional(v.any()),
      summary: v.optional(v.any()),
      sampleRows: v.optional(v.any()),
      manifest: v.optional(v.any()),
      createdAt: v.number(),
    }).index("by_created", ["createdAt"]),

    investigations: defineTable({
      ownerId: v.optional(v.string()),
      title: v.string(),
      status: v.string(), // open | reviewing | escalated | closed
      priority: v.string(),
      datasetId: v.optional(v.string()),
      alertIds: v.array(v.string()),
      notes: v.array(v.any()),
      updatedAt: v.number(),
      createdAt: v.number(),
    }).index("by_created", ["createdAt"]),

    bookings: defineTable({
      ownerId: v.optional(v.string()),
      ownerEmail: v.optional(v.string()),
      catalogId: v.string(),
      catalogTitle: v.string(),
      date: v.string(),
      slot: v.string(),
      status: v.string(),
      createdAt: v.number(),
    }).index("by_created", ["createdAt"]),

    orders: defineTable({
      ownerId: v.optional(v.string()),
      ownerEmail: v.optional(v.string()),
      catalogId: v.string(),
      catalogTitle: v.string(),
      amount: v.number(),
      currency: v.string(),
      status: v.string(),
      createdAt: v.number(),
    }).index("by_created", ["createdAt"]),

    posts: defineTable({
      ownerId: v.optional(v.string()),
      ownerEmail: v.optional(v.string()),
      title: v.string(),
      body: v.string(),
      attachmentName: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_created", ["createdAt"]),

    comments: defineTable({
      ownerId: v.optional(v.string()),
      ownerEmail: v.optional(v.string()),
      thread: v.string(),
      body: v.string(),
      createdAt: v.number(),
    }).index("by_thread", ["thread"]),

    alertReviews: defineTable({
      key: v.string(), // alertId, or "entity:<id>" for entity notes
      status: v.string(), // new | reviewing | reviewed | false-positive | escalated
      actor: v.optional(v.string()),
      notes: v.array(v.any()), // { at, text, actor }
      updatedAt: v.number(),
      createdAt: v.number(),
    }).index("by_key", ["key"]),

    auditEvents: defineTable({
      ownerId: v.optional(v.string()),
      actor: v.string(),
      action: v.string(),
      target: v.optional(v.string()),
      detail: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_created", ["createdAt"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
