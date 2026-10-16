import type { PaseoApi, PaseoWorkspace } from "@getpaseo/client";
import { execFile } from "node:child_process";
import type { Backend, Workspace } from "./engine";
import { isAcknowledgment, type TextItem } from "./policy";
export function backend(paseo: PaseoApi, paseoHome: string): Backend {
  const convert = (w: PaseoWorkspace): Workspace => ({
    id: w.id,
    name: w.name,
    title: w.title ?? null,
    project: w.projectCustomName || w.projectDisplayName,
  });
  return {
    async workspace(id) {
      const w = await paseo.workspaces.ref(id).refresh();
      return w ? convert(w) : null;
    },
    async workspaces() {
      const rows: Workspace[] = [];
      let cursor: string | undefined;
      do {
        const page = await paseo.workspaces.list({
          sort: [{ key: "activity_at", direction: "desc" }],
          page: { limit: 100, ...(cursor ? { cursor } : {}) },
        });
        rows.push(...page.entries.map(convert));
        cursor = page.pageInfo.hasMore
          ? (page.pageInfo.nextCursor ?? undefined)
          : undefined;
      } while (cursor);
      return rows;
    },
    async agents(id) {
      const rows = [];
      let cursor: string | undefined;
      do {
        const page = await paseo.agents.list({
          filter: { includeArchived: false },
          sort: [{ key: "created_at", direction: "asc" }],
          page: { limit: 100, ...(cursor ? { cursor } : {}) },
        });
        for (const { agent } of page.entries) {
          if (agent.workspaceId === id)
            rows.push({
              id: agent.id,
              parent: !!agent.labels?.["paseo.parent-agent-id"],
              title: agent.title ?? "",
            });
        }
        cursor = page.pageInfo.hasMore
          ? (page.pageInfo.nextCursor ?? undefined)
          : undefined;
      } while (cursor);
      return rows;
    },
    async timeline(id) {
      const h = paseo.agents.ref(id).timeline;
      const first = await h.refetch({ direction: "after", limit: 30 });
      let last = await h.refetch({ direction: "tail", limit: 100 });
      const entries = [...last.entries];
      const substantive = () =>
        entries.some(
          (e) =>
            e.item.type === "user_message" &&
            e.item.text &&
            !isAcknowledgment(e.item.text),
        );
      for (
        let pages = 0;
        !substantive() && last.hasOlder && last.startCursor && pages < 10;
        pages++
      ) {
        last = await h.refetch({
          direction: "before",
          cursor: last.startCursor,
          limit: 100,
        });
        entries.unshift(...last.entries);
      }
      if (first.error || last.error || (!substantive() && last.hasOlder))
        throw new Error(
          "Cannot find a recent user objective in the bounded timeline window. Retry after a substantive user message.",
        );
      return [...first.entries, ...entries]
        .sort((a, b) => a.seqStart - b.seqStart)
        .map((e) => e.item) as TextItem[];
    },
    async rename(id, title) {
      await paseo.workspaces.ref(id).setTitle(title);
    },
    async renameAgent(id, title) {
      await new Promise<void>((resolve, reject) => {
        execFile(
          process.env.TIGER_PASEO_PATH || "paseo",
          [
            "agent",
            "update",
            id,
            "--name",
            title,
            "--json",
            "--home",
            paseoHome,
          ],
          { timeout: 10_000, maxBuffer: 128_000 },
          (error) => (error ? reject(error) : resolve()),
        );
      });
    },
  };
}
