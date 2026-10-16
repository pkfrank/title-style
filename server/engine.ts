import { recordSchema, Store, type RecordState } from "./store";
import { fingerprint, sourceFrom, type TextItem } from "./policy";
import {
  generate,
  type GenerationInput,
  type GenerationResult,
} from "./generator";
import type { TitleStyleSettings } from "../shared/settings";
import type { TitleRow } from "../shared/contracts";
import { shouldFollowWorkspaceTitle } from "./session-titles";
export type Workspace = {
  id: string;
  name: string;
  title: string | null;
  project: string;
};
export type Agent = { id: string; parent: boolean; title: string };
export interface Backend {
  workspace(id: string): Promise<Workspace | null>;
  workspaces(): Promise<Workspace[]>;
  agents(id: string): Promise<Agent[]>;
  timeline(id: string): Promise<readonly TextItem[]>;
  rename(id: string, title: string | null): Promise<void>;
  renameAgent(id: string, title: string): Promise<void>;
}
type Job = { id: string; automatic: boolean; due: number };
export class Engine {
  private jobs = new Map<string, Job>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller = new AbortController();
  private active: string | null = null;
  private writes = new Set<string>();
  private serial: Promise<unknown> = Promise.resolve();
  constructor(
    readonly store: Store,
    private backend: Backend,
    private settings: () => Promise<TitleStyleSettings>,
    private model: (
      input: GenerationInput,
      signal: AbortSignal,
    ) => Promise<GenerationResult> = generate,
  ) {}
  private transaction<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.serial.then(fn);
    this.serial = task.catch(() => {});
    return task;
  }
  async close() {
    this.controller.abort();
    clearTimeout(this.timer);
    this.jobs.clear();
    await this.serial;
    await this.store.save();
  }
  private state(w: Workspace) {
    return (this.store.state.records[w.id] ??= recordSchema.parse({
      expectedName: w.name,
      expectedTitle: w.title,
      original: w.name,
    }));
  }
  private observe(w: Workspace): RecordState {
    const r = this.state(w);
    if (this.writes.has(w.id)) return r;
    if (r.pending) {
      const pending = r.pending;
      if (w.name === pending.after) {
        r.history.push(pending);
        r.expectedName = w.name;
        r.expectedTitle = w.title;
      }
      r.pending = null;
      r.locked = true;
      r.revision++;
      r.error =
        "Recovered an interrupted rename. Inspect the title, then unlock to resume.";
    }
    if (w.name !== r.expectedName || w.title !== r.expectedTitle) {
      if (r.managed || r.proposal) {
        r.locked = true;
        r.proposal = null;
        r.revision++;
        r.error = "Title changed outside Tiger. Locked to preserve that edit.";
      }
      r.expectedName = w.name;
      r.expectedTitle = w.title;
    }
    return r;
  }
  async created(id: string) {
    await this.transaction(async () => {
      const prior = this.store.state.records[id];
      if (prior?.managed || prior?.locked || prior?.history.length) return;
      const settings = await this.settings();
      if (!settings.enabled) return;
      const w = await this.backend.workspace(id);
      if (!w) return;
      this.state(w).managed = true;
      await this.store.save();
    });
  }
  async reconcile() {
    await this.transaction(async () => {
      if (!(await this.settings()).enabled) return;
      for (const w of await this.backend.workspaces()) {
        const r = this.store.state.records[w.id];
        if (!r?.managed || r.locked) continue;
        try {
          await this.syncAgentTitles(w, w.name, this.followedTitles(r));
        } catch {
          r.error = "One or more generic session tabs could not be updated.";
        }
      }
      await this.store.save();
    });
  }
  async onTurn(id: string, agentId: string, parent: boolean) {
    if (parent || this.controller.signal.aborted) return;
    await this.transaction(async () => {
      const r = this.store.state.records[id];
      if (!r?.managed || r.locked) return;
      const settings = await this.settings();
      if (!settings.enabled) return;
      const w = await this.backend.workspace(id);
      if (w)
        try {
          await this.syncAgentTitles(w, w.name, this.followedTitles(r));
        } catch {
          r.error = "One or more generic session tabs could not be updated.";
          await this.store.save();
        }
      if (r.owner && r.owner !== agentId) return;
      // Anchor on one top-level agent. Sibling/subagent work cannot redirect the workspace.
      if (!r.owner) {
        r.owner = agentId;
        await this.store.save();
      }
      this.enqueue({
        id,
        automatic: true,
        due: Math.max(
          Date.now() + 1_000,
          (r.lastGeneratedAt ?? 0) + settings.cooldownSeconds * 1000,
        ),
      });
    });
  }
  private enqueue(job: Job) {
    const prior = this.jobs.get(job.id);
    if (prior && !prior.automatic && job.automatic) return;
    this.jobs.set(job.id, job);
    this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (this.active || this.controller.signal.aborted || !this.jobs.size)
      return;
    const job = [...this.jobs.values()].sort((a, b) => a.due - b.due)[0];
    this.timer = setTimeout(
      () => {
        this.jobs.delete(job.id);
        this.active = job.id;
        void this.run(job)
          .catch(() => {})
          .finally(() => {
            this.active = null;
            this.schedule();
          });
      },
      Math.max(0, job.due - Date.now()),
    );
  }
  async list() {
    return this.transaction(async () => {
      const before = fingerprint(this.store.state);
      const workspaces = await this.backend.workspaces();
      const rows: TitleRow[] = workspaces.map((w) => {
        const r = this.observe(w);
        return {
          id: w.id,
          name: w.name,
          project: w.project,
          original: r.original,
          revision: r.revision,
          locked: r.locked,
          managed: r.managed,
          busy: this.active === w.id || this.jobs.has(w.id),
          proposal: r.proposal?.title ?? null,
          error: r.error,
          history: r.history.slice(-20).reverse(),
          lastGeneratedAt: r.lastGeneratedAt,
        };
      });
      if (before !== fingerprint(this.store.state)) await this.store.save();
      return {
        rows,
        calls: this.store.state.calls.filter((t) => t > Date.now() - 3600_000)
          .length,
        estimatedUsd: this.store.state.estimatedUsd,
        busy: !!this.active,
      };
    });
  }
  async change(
    id: string,
    revision: number,
    action: "preview" | "apply" | "lock" | "unlock" | "undo",
  ) {
    return this.transaction(async () => {
      const w = await this.backend.workspace(id);
      if (!w) throw new Error("Workspace is no longer available.");
      const r = this.observe(w);
      if (r.revision !== revision) {
        await this.store.save();
        throw new Error(
          "Title changed since this screen loaded. Refresh and try again.",
        );
      }
      if (action === "preview") {
        if (this.active === id || this.jobs.has(id)) return { accepted: true };
        r.error = null;
        this.enqueue({ id, automatic: false, due: Date.now() });
      }
      if (action === "lock" || action === "unlock") {
        r.locked = action === "lock";
        r.revision++;
        r.error = null;
        this.jobs.delete(id);
        if (!r.locked) {
          r.managed = true;
          r.expectedName = w.name;
          r.expectedTitle = w.title;
          this.enqueue({ id, automatic: true, due: Date.now() });
        }
      }
      if (action === "apply") {
        if (!r.proposal) throw new Error("Generate a preview first.");
        if (r.proposal.baseName !== w.name || r.proposal.baseTitle !== w.title)
          throw new Error("Preview is stale. Generate it again.");
        await this.write(w, r, r.proposal.title, "apply");
        r.managed = true;
      }
      if (action === "undo") {
        const last = r.history.at(-1);
        if (!last || last.kind === "undo" || w.name !== last.after)
          throw new Error("The current title cannot be undone safely.");
        r.locked = true;
        await this.write(w, r, last.beforeTitle, "undo", last.before);
      }
      await this.store.save();
      return { accepted: true };
    });
  }
  private async write(
    w: Workspace,
    r: RecordState,
    title: string | null,
    kind: "auto" | "apply" | "undo",
    display = title ?? w.name,
  ) {
    if (this.controller.signal.aborted) throw new Error("Plugin is stopping.");
    // Journal before mutation so a reload never silently forgets ownership/history.
    const pending = {
      before: w.name,
      beforeTitle: w.title,
      after: display,
      kind,
      at: Date.now(),
    };
    r.pending = pending;
    await this.store.save();
    const fresh = await this.backend.workspace(w.id);
    if (!fresh || fresh.name !== w.name || fresh.title !== w.title) {
      r.pending = null;
      r.locked = true;
      r.revision++;
      await this.store.save();
      throw new Error(
        "Title changed before rename; preserved the newer title.",
      );
    }
    this.writes.add(w.id);
    try {
      await this.backend.rename(w.id, title);
      r.history = [...r.history, pending].slice(-20);
      r.expectedName = display;
      r.expectedTitle = title;
      r.proposal = null;
      r.revision++;
      r.error = null;
      r.pending = null;
      await this.store.save();
    } finally {
      this.writes.delete(w.id);
    }
    try {
      await this.syncAgentTitles(w, display, [w.name]);
    } catch {
      r.error =
        "Workspace renamed, but one or more session tabs could not be updated.";
      await this.store.save();
    }
  }
  private async syncAgentTitles(
    w: Workspace,
    title: string,
    previousWorkspaceTitles: readonly string[] = [],
  ) {
    if (!title.trim()) return;
    const agents = await this.backend.agents(w.id);
    let failed = false;
    for (const agent of agents) {
      if (
        agent.parent ||
        agent.title === title ||
        !shouldFollowWorkspaceTitle(agent.title, previousWorkspaceTitles)
      )
        continue;
      try {
        await this.backend.renameAgent(agent.id, title);
        agent.title = title;
      } catch {
        failed = true;
      }
    }
    if (failed)
      throw new Error("One or more session titles could not be updated.");
  }
  private followedTitles(r: RecordState) {
    return [
      r.original,
      r.expectedName,
      ...r.history.flatMap((entry) => [entry.before, entry.after]),
    ];
  }
  private async run(job: Job) {
    let revision: number | undefined;
    try {
      const prepared = await this.transaction(async () => {
        const settings = await this.settings();
        const w = await this.backend.workspace(job.id);
        if (!w) return;
        const r = this.observe(w);
        if (job.automatic && (!settings.enabled || r.locked || !r.managed))
          return;
        const agents = await this.backend.agents(job.id);
        const roots = agents.filter((a) => !a.parent);
        const owner =
          roots.find((a) => a.id === r.owner) ??
          (!r.owner ? roots[0] : undefined);
        if (!owner)
          throw new Error(
            "No primary agent is available to name this workspace.",
          );
        r.owner = owner.id;
        const source = sourceFrom(
          await this.backend.timeline(owner.id),
          owner.title || w.name,
        );
        const hash = fingerprint({
          source,
          instructions: settings.instructions,
          model: settings.model,
        });
        if (job.automatic && hash === r.hash) return;
        this.store.state.calls = [
          ...this.store.state.calls.filter((t) => t > Date.now() - 3600_000),
          Date.now(),
        ];
        r.lastGeneratedAt = Date.now();
        r.error = null;
        revision = r.revision;
        await this.store.save();
        return {
          w,
          hash,
          input: {
            ...source,
            project: w.project,
            current: w.name,
            instructions: settings.instructions,
            stableSubject:
              job.automatic && w.name.includes(" · ")
                ? w.name.split(" · ")[0]
                : undefined,
          },
        };
      });
      if (!prepared || this.controller.signal.aborted) return;
      const result = await this.model(prepared.input, this.controller.signal);
      await this.transaction(async () => {
        this.store.state.estimatedUsd += result.estimatedUsd;
        const w = await this.backend.workspace(job.id);
        if (!w || this.controller.signal.aborted) return;
        const r = this.observe(w);
        if (
          r.revision !== revision ||
          w.name !== prepared.w.name ||
          w.title !== prepared.w.title
        ) {
          await this.store.save();
          return;
        }
        if (job.automatic && (!(await this.settings()).enabled || r.locked))
          return;
        // A newer user objective invalidates an in-flight result.
        const source = sourceFrom(
          await this.backend.timeline(r.owner!),
          prepared.input.first,
        );
        const currentSettings = await this.settings();
        if (
          fingerprint({
            source,
            instructions: currentSettings.instructions,
            model: currentSettings.model,
          }) !== prepared.hash
        ) {
          this.enqueue({
            ...job,
            due: Date.now() + currentSettings.cooldownSeconds * 1000,
          });
          return;
        }
        r.hash = prepared.hash;
        if (result.title !== w.name) {
          if (job.automatic) await this.write(w, r, result.title, "auto");
          else {
            r.proposal = {
              title: result.title,
              baseName: w.name,
              baseTitle: w.title,
              at: Date.now(),
            };
            r.revision++;
          }
        } else {
          r.proposal = null;
          r.error = "The current title already fits.";
        }
        await this.store.save();
      });
    } catch (error) {
      await this.transaction(async () => {
        const r = this.store.state.records[job.id];
        if (r && (revision === undefined || r.revision === revision)) {
          r.error = error instanceof Error ? error.message : "Naming failed.";
          await this.store.save();
        }
        console.error(
          "[tiger-titles] Naming stopped; see the workspace row for details.",
        );
      });
    }
  }
}
