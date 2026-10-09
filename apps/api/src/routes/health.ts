import { Hono } from "hono";

export function healthRoutes(info: { version: string; commit: string }): Hono {
  const app = new Hono();
  app.get("/", (c) => c.json({ ok: true, ...info }));
  return app;
}
