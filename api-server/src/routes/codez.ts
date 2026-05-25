import { Router } from "express";
import { db } from "@workspace/db";
import { codesTable, staffTable, tasksTable, leavesTable, announcementsTable, promotionRequestsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  CreateCodeBody,
  DeleteCodeParams,
  CreateStaffBody,
  DeleteStaffParams,
  UpdateStaffParams,
  UpdateStaffBody,
  StaffLoginBody,
  CreateTaskBody,
  UpdateTaskParams,
  UpdateTaskBody,
  DeleteTaskParams,
  CreateLeaveBody,
  UpdateLeaveParams,
  UpdateLeaveBody,
} from "@workspace/api-zod";

const router = Router();

const fmt = (row: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
};

router.get("/codes", async (_req, res) => {
  const rows = await db.select().from(codesTable).orderBy(codesTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/codes", async (req, res) => {
  const body = CreateCodeBody.parse(req.body);
  const [row] = await db.insert(codesTable).values(body).returning();
  res.status(201).json(fmt(row));
});

router.delete("/codes/:id", async (req, res) => {
  const { id } = DeleteCodeParams.parse({ id: Number(req.params.id) });
  await db.delete(codesTable).where(eq(codesTable.id, id));
  res.json({ ok: true });
});

router.get("/staff", async (_req, res) => {
  const rows = await db.select({
    id: staffTable.id,
    username: staffTable.username,
    role: staffTable.role,
    tasksCompleted: staffTable.tasksCompleted,
    tasksFailed: staffTable.tasksFailed,
    createdAt: staffTable.createdAt,
  }).from(staffTable).orderBy(staffTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/staff", async (req, res) => {
  const body = CreateStaffBody.parse(req.body);
  const [row] = await db.insert(staffTable).values(body).returning({
    id: staffTable.id,
    username: staffTable.username,
    role: staffTable.role,
    tasksCompleted: staffTable.tasksCompleted,
    tasksFailed: staffTable.tasksFailed,
    createdAt: staffTable.createdAt,
  });
  res.status(201).json(fmt(row));
});

router.delete("/staff/:id", async (req, res) => {
  const { id } = DeleteStaffParams.parse({ id: Number(req.params.id) });
  await db.delete(staffTable).where(eq(staffTable.id, id));
  res.json({ ok: true });
});

router.patch("/staff/:id", async (req, res) => {
  const { id } = UpdateStaffParams.parse({ id: Number(req.params.id) });
  const body = UpdateStaffBody.parse(req.body);
  const [row] = await db.update(staffTable).set(body).where(eq(staffTable.id, id)).returning({
    id: staffTable.id,
    username: staffTable.username,
    role: staffTable.role,
    tasksCompleted: staffTable.tasksCompleted,
    tasksFailed: staffTable.tasksFailed,
    createdAt: staffTable.createdAt,
  });
  res.json(fmt(row));
});

router.post("/staff/login", async (req, res) => {
  const body = StaffLoginBody.parse(req.body);
  const [row] = await db.select({
    id: staffTable.id,
    username: staffTable.username,
    role: staffTable.role,
    tasksCompleted: staffTable.tasksCompleted,
    tasksFailed: staffTable.tasksFailed,
    createdAt: staffTable.createdAt,
  }).from(staffTable).where(eq(staffTable.username, body.username));
  if (!row) return res.status(401).json({ error: "Invalid credentials" });
  const [full] = await db.select().from(staffTable).where(eq(staffTable.id, row.id));
  if (full.password !== body.password) return res.status(401).json({ error: "Invalid credentials" });
  return res.json(fmt(row));
});

router.get("/tasks", async (_req, res) => {
  const rows = await db.select().from(tasksTable).orderBy(tasksTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/tasks", async (req, res) => {
  const body = CreateTaskBody.parse(req.body);
  const [member] = await db.select().from(staffTable).where(eq(staffTable.id, body.staffId));
  if (!member) return res.status(404).json({ error: "Staff member not found" });
  const [row] = await db.insert(tasksTable).values({ ...body, staffUsername: member.username, status: "pending" }).returning();
  res.status(201).json(fmt(row));
});

router.patch("/tasks/:id", async (req, res) => {
  const { id } = UpdateTaskParams.parse({ id: Number(req.params.id) });
  const body = UpdateTaskBody.parse(req.body);
  const updates: Record<string, unknown> = { ...body };
  if (body.status === "done") {
    updates.doneAt = new Date();
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (task && task.status !== "done") {
      await db.update(staffTable)
        .set({ tasksCompleted: sql`${staffTable.tasksCompleted} + 1` })
        .where(eq(staffTable.id, task.staffId));
    }
  } else if (body.status === "failed") {
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (task && task.status !== "failed") {
      await db.update(staffTable)
        .set({ tasksFailed: sql`${staffTable.tasksFailed} + 1` })
        .where(eq(staffTable.id, task.staffId));
    }
  }
  const [row] = await db.update(tasksTable).set(updates as Parameters<typeof db.update>[0]).where(eq(tasksTable.id, id)).returning();
  res.json(fmt(row));
});

router.delete("/tasks/:id", async (req, res) => {
  const { id } = DeleteTaskParams.parse({ id: Number(req.params.id) });
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.json({ ok: true });
});

router.get("/leaves", async (_req, res) => {
  const rows = await db.select().from(leavesTable).orderBy(leavesTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/leaves", async (req, res) => {
  const body = CreateLeaveBody.parse(req.body);
  const [row] = await db.insert(leavesTable).values({ ...body, status: "pending" }).returning();
  res.status(201).json(fmt(row));
});

router.patch("/leaves/:id", async (req, res) => {
  const { id } = UpdateLeaveParams.parse({ id: Number(req.params.id) });
  const body = UpdateLeaveBody.parse(req.body);
  const [row] = await db.update(leavesTable)
    .set({ ...body, reviewedAt: new Date() })
    .where(eq(leavesTable.id, id))
    .returning();
  res.json(fmt(row));
});

router.get("/stats", async (_req, res) => {
  const [codeStats] = await db.select({
    total: sql<number>`count(*)::int`,
    free: sql<number>`count(*) filter (where type = 'free')::int`,
    paid: sql<number>`count(*) filter (where type = 'paid')::int`,
  }).from(codesTable);

  const [staffStats] = await db.select({
    total: sql<number>`count(*)::int`,
  }).from(staffTable);

  const [taskStats] = await db.select({
    total: sql<number>`count(*)::int`,
    done: sql<number>`count(*) filter (where status = 'done')::int`,
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
    failed: sql<number>`count(*) filter (where status = 'failed')::int`,
  }).from(tasksTable);

  const [leaveStats] = await db.select({
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
  }).from(leavesTable);

  res.json({
    totalCodes: codeStats.total,
    freeCodes: codeStats.free,
    paidCodes: codeStats.paid,
    totalStaff: staffStats.total,
    totalTasks: taskStats.total,
    completedTasks: taskStats.done,
    pendingTasks: taskStats.pending,
    failedTasks: taskStats.failed,
    pendingLeaves: leaveStats.pending,
  });
});

router.get("/announcements", async (req, res) => {
  const type = req.query.type as string | undefined;
  let rows;
  if (type) {
    rows = await db.select().from(announcementsTable).where(eq(announcementsTable.type, type)).orderBy(announcementsTable.createdAt);
  } else {
    rows = await db.select().from(announcementsTable).orderBy(announcementsTable.createdAt);
  }
  res.json(rows.map(fmt));
});

router.post("/announcements", async (req, res) => {
  const { type, title, content, pinned } = req.body;
  if (!type || !title || !content) return res.status(400).json({ error: "type, title and content required" });
  const [row] = await db.insert(announcementsTable).values({ type, title, content, pinned: pinned ? "true" : "false" }).returning();
  res.status(201).json(fmt(row));
});

router.delete("/announcements/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  res.json({ ok: true });
});

// ── Promotion Requests ──
router.get("/promotion-requests", async (req, res) => {
  const staffId = req.query.staffId ? Number(req.query.staffId) : undefined;
  let rows;
  if (staffId) {
    rows = await db.select().from(promotionRequestsTable).where(eq(promotionRequestsTable.staffId, staffId)).orderBy(promotionRequestsTable.createdAt);
  } else {
    rows = await db.select().from(promotionRequestsTable).orderBy(promotionRequestsTable.createdAt);
  }
  res.json(rows.map(fmt));
});

router.post("/promotion-requests", async (req, res) => {
  const { staffId, staffUsername, currentRole, requestedRole, reason } = req.body;
  if (!staffId || !staffUsername || !currentRole || !requestedRole || !reason)
    return res.status(400).json({ error: "all fields required" });
  const existing = await db.select().from(promotionRequestsTable)
    .where(eq(promotionRequestsTable.staffId, staffId));
  const hasPending = existing.some(r => r.status === "pending");
  if (hasPending) return res.status(409).json({ error: "You already have a pending promotion request" });
  const [row] = await db.insert(promotionRequestsTable)
    .values({ staffId, staffUsername, currentRole, requestedRole, reason })
    .returning();
  res.status(201).json(fmt(row));
});

router.put("/promotion-requests/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status required" });
  const [row] = await db.update(promotionRequestsTable)
    .set({ status, reviewedAt: new Date() })
    .where(eq(promotionRequestsTable.id, id))
    .returning();
  if (status === "approved" && row) {
    await db.update(staffTable)
      .set({ role: row.requestedRole })
      .where(eq(staffTable.id, row.staffId));
  }
  res.json(fmt(row));
});

export default router;
