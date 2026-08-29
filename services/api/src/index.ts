import { Hono } from "hono";

interface Bindings {
  DB: D1Database;
  FILES: R2Bucket;
  APP_ENV: string;
}

export const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "boardops-api",
  }),
);

app.get("/ready", async (c) => {
  try {
    const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    if (row?.ok !== 1) throw new Error("D1 readiness probe returned an unexpected result");

    return c.json({
      status: "ready",
      database: "d1",
      storage: "r2-bound",
      environment: c.env.APP_ENV,
    });
  } catch {
    return c.json({ status: "not_ready" }, 503);
  }
});

const api = new Hono<{ Bindings: Bindings }>();
api.get("/", (c) => c.json({ name: "BoardOps API", version: "v1", status: "foundation" }));
app.route("/api/v1", api);

export default app;
