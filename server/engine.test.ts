import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Engine, type Backend, type Workspace } from "./engine";
import { Store } from "./store";
import { titleStyleSettings } from "../shared/settings";
import {
  parseTitle,
  sourceFrom,
  isAcknowledgment,
  type TextItem,
} from "./policy";
import type { GenerationResult } from "./generator";
async function fixture(t: any, model?: () => Promise<GenerationResult>) {
  const dir = await mkdtemp(path.join(tmpdir(), "tiger-test-"));
  const store = new Store(path.join(dir, "state.json"));
  await store.load();
  const w: Workspace = {
    id: "w",
    name: "Build registration form",
    title: null,
    project: "Camp",
  };
  let timeline: TextItem[] = [
    { type: "user_message", text: "Build registration form for Camp" },
  ];
  let calls = 0;
  let writes = 0;
  const settings = titleStyleSettings.schema.parse({});
  const backend: Backend = {
    workspace: async () => ({ ...w }),
    workspaces: async () => [{ ...w }],
    agents: async () => [
      { id: "main", parent: false, title: w.name },
      { id: "sub", parent: true, title: "Refactor tests" },
    ],
    timeline: async () => timeline,
    rename: async (_, title) => {
      w.title = title;
      w.name = title ?? "Build registration form";
      writes++;
    },
  };
  const engine = new Engine(
    store,
    backend,
    async () => settings,
    async () => {
      calls++;
      return model
        ? model()
        : { title: "Camp · Build registration form", estimatedUsd: 0.001 };
    },
  );
  t.after(async () => {
    await engine.close();
    await rm(dir, { recursive: true, force: true });
  });
  const run = (automatic = false) =>
    engine["run"]({ id: "w", automatic, due: 0 });
  const row = async () => (await engine.list()).rows[0];
  return {
    engine,
    store,
    w,
    settings,
    run,
    row,
    get calls() {
      return calls;
    },
    get writes() {
      return writes;
    },
    setTimeline: (items: TextItem[]) => {
      timeline = items;
    },
  };
}
test("existing workspaces preview without renaming; apply and undo preserve original", async (t) => {
  const f = await fixture(t);
  await f.row();
  await f.run();
  let row = await f.row();
  assert.equal(f.writes, 0);
  assert.equal(row.proposal, "Camp · Build registration form");
  await f.engine.change("w", row.revision, "apply");
  row = await f.row();
  assert.equal(row.managed, true);
  assert.equal(f.w.title, row.name);
  await f.engine.change("w", row.revision, "undo");
  row = await f.row();
  assert.equal(f.w.title, null);
  assert.equal(row.locked, true);
  assert.equal(row.history.length, 2);
});
test("new workspaces name automatically and survive reload", async (t) => {
  const f = await fixture(t);
  await f.engine.created("w");
  await f.run(true);
  assert.equal(f.writes, 1);
  const restored = new Store(f.store.file);
  await restored.load();
  assert.equal(restored.state.records.w.history.length, 1);
  assert.equal(restored.state.records.w.expectedName, f.w.name);
});
test("automatic mode ignores old workspaces", async (t) => {
  const f = await fixture(t);
  await f.row();
  await f.run(true);
  assert.equal(f.calls, 0);
});
test("manual rename before generation locks and never spends", async (t) => {
  const f = await fixture(t);
  await f.engine.created("w");
  f.w.name = "My chosen title";
  f.w.title = f.w.name;
  await f.run(true);
  assert.equal(f.calls, 0);
  assert.equal((await f.row()).locked, true);
});
test("manual rename while model is running wins", async (t) => {
  let finish!: (r: GenerationResult) => void;
  const f = await fixture(
    t,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await f.engine.created("w");
  const running = f.run(true);
  while (!finish) await new Promise((r) => setTimeout(r, 1));
  f.w.name = "Manual title";
  f.w.title = f.w.name;
  finish({ title: "Camp · Build registration form", estimatedUsd: 0.001 });
  await running;
  assert.equal(f.writes, 0);
  assert.equal((await f.row()).locked, true);
});
test("lock during generation prevents late write", async (t) => {
  let finish!: (r: GenerationResult) => void;
  const f = await fixture(
    t,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await f.engine.created("w");
  const running = f.run(true);
  while (!finish) await new Promise((r) => setTimeout(r, 1));
  await f.engine.change("w", (await f.row()).revision, "lock");
  finish({ title: "Camp · Build registration form", estimatedUsd: 0 });
  await running;
  assert.equal(f.writes, 0);
});
test("stale UI cannot apply a preview over a manual change", async (t) => {
  const f = await fixture(t);
  await f.run();
  const old = await f.row();
  f.w.name = "New manual name";
  f.w.title = f.w.name;
  await assert.rejects(f.engine.change("w", old.revision, "apply"), /changed/);
  assert.equal(f.writes, 0);
});
test("acknowledgments do not cause more model calls", async (t) => {
  const f = await fixture(t);
  await f.engine.created("w");
  await f.run(true);
  f.setTimeline([
    { type: "user_message", text: "Build registration form for Camp" },
    { type: "user_message", text: "Good, keep going" },
  ]);
  await f.run(true);
  assert.equal(f.calls, 1);
});
test("primary agent ownership excludes subagents and siblings", async (t) => {
  const f = await fixture(t);
  await f.engine.created("w");
  await f.engine.onTurn("w", "sub", true);
  assert.equal(f.store.state.records.w.owner, null);
  await f.engine.onTurn("w", "main", false);
  await f.engine.onTurn("w", "sibling", false);
  assert.equal(f.store.state.records.w.owner, "main");
});
test("hourly budget survives state reload and rejects extra calls", async (t) => {
  const f = await fixture(t);
  f.settings.hourlyLimit = 1;
  await f.run();
  await f.run();
  assert.equal(f.calls, 1);
  assert.match((await f.row()).error!, /budget/);
  const s = new Store(f.store.file);
  await s.load();
  assert.equal(s.state.calls.length, 1);
});
test("disabled automatic naming still allows explicit previews", async (t) => {
  const f = await fixture(t);
  f.settings.enabled = false;
  await f.engine.created("w");
  await f.run(true);
  assert.equal(f.calls, 0);
  await f.run();
  assert.equal(f.calls, 1);
  assert.equal(f.writes, 0);
});
test("new objective while generating invalidates old result", async (t) => {
  let finish!: (r: GenerationResult) => void;
  const f = await fixture(
    t,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await f.engine.created("w");
  const running = f.run(true);
  while (!finish) await new Promise((r) => setTimeout(r, 1));
  f.setTimeline([
    { type: "user_message", text: "Build registration form for Camp" },
    {
      type: "user_message",
      text: "Switch to designing the access permissions",
    },
  ]);
  finish({ title: "Camp · Build registration form", estimatedUsd: 0 });
  await running;
  assert.equal(f.writes, 0);
});
test("corrupt state fails closed rather than losing manual locks", async (t) => {
  const f = await fixture(t);
  await writeFile(f.store.file, "not json");
  const next = new Store(f.store.file);
  await assert.rejects(next.load(), /unreadable/);
});
test("unfinished write is recovered and locked", async (t) => {
  const f = await fixture(t);
  await f.engine.created("w");
  f.store.state.records.w.pending = {
    before: f.w.name,
    beforeTitle: null,
    after: "Camp · Build form",
    kind: "auto",
    at: Date.now(),
  };
  f.w.name = "Camp · Build form";
  f.w.title = f.w.name;
  const row = await f.row();
  assert.equal(row.locked, true);
  assert.equal(row.history.length, 1);
  assert.match(row.error!, /interrupted/);
});
test("invalid, completion and changing-subject model titles are rejected", () => {
  assert.throws(() => parseTitle({ title: "Camp · Done" }));
  assert.throws(() => parseTitle({ title: "Camp · " + "a".repeat(50) }));
  assert.throws(() => parseTitle({ title: "Other · Build form" }, "Camp"));
  assert.equal(
    parseTitle({ title: "Camp · Build form" }, "Camp"),
    "Camp · Build form",
  );
});
test("input omits tools and redacts common secrets", () => {
  const source = sourceFrom(
    [
      {
        type: "user_message",
        text: "Email alice@example.com with token=abcdef and https://example.com/private",
      },
      { type: "tool_call", text: "secret tool output" },
      { type: "user_message", text: "good, keep going" },
    ],
    "",
  );
  assert(!JSON.stringify(source).includes("abcdef"));
  assert(!JSON.stringify(source).includes("alice@"));
  assert(!JSON.stringify(source).includes("private"));
  assert(!JSON.stringify(source).includes("tool output"));
  assert(isAcknowledgment("Good, keep going"));
});

test("workspace-created hook still enrolls a workspace seen by a concurrent list", async (t) => {
  const f = await fixture(t);
  await f.row();
  await f.engine.created("w");
  await f.run(true);
  assert.equal(f.writes, 1);
});
test("shutdown prevents a late result from changing a title", async (t) => {
  let finish!: (r: GenerationResult) => void;
  const f = await fixture(
    t,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await f.engine.created("w");
  const running = f.run(true);
  while (!finish) await new Promise((r) => setTimeout(r, 1));
  await f.engine.close();
  finish({ title: "Camp · Build registration form", estimatedUsd: 0 });
  await running;
  assert.equal(f.writes, 0);
});
