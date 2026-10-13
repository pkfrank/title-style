import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PaseoApi } from "@getpaseo/client";
import { homedir } from "node:os";
import path from "node:path";
import { titleStyleSettings } from "./shared/settings";
import { listTitles, changeTitle } from "./shared/contracts";
import { Store } from "./server/store";
import { Engine } from "./server/engine";
import { backend } from "./server/backend";
export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(titleStyleSettings);
  const store = new Store(
    path.join(
      process.env.PASEO_HOME || path.join(homedir(), ".paseo"),
      "plugin-data",
      "tiger-titles",
      "state.json",
    ),
  );
  const ready = store.load();
  let engine: Engine | undefined;
  let stopped = false;
  const get = async (paseo: PaseoApi) => {
    await ready;
    if (stopped) throw new Error("Plugin is stopping.");
    return (engine ??= new Engine(store, backend(paseo), async () => {
      const s = await settings.read();
      if (s.status !== "ready") throw new Error("Naming settings are invalid.");
      return s.values;
    }));
  };
  server.handle(listTitles, async (_, { paseo }) => (await get(paseo)).list());
  server.handle(changeTitle, async (input, { paseo }) =>
    (await get(paseo)).change(input.workspaceId, input.revision, input.action),
  );
  const report = () =>
    console.error(
      "[tiger-titles] Lifecycle action failed; check settings and local state.",
    );
  const removers = [
    server.on("workspace.created", (event, { paseo }) => {
      void get(paseo)
        .then((e) => e.created(event.workspace.id))
        .catch(report);
    }),
    server.on("agent.turn_started", (event, { paseo }) => {
      if (event.agent.workspaceId)
        void get(paseo)
          .then((e) =>
            e.onTurn(
              event.agent.workspaceId!,
              event.agent.id,
              !!event.agent.parentAgentId,
            ),
          )
          .catch(report);
    }),
    server.on("agent.turn_ended", (event, { paseo }) => {
      if (event.agent.workspaceId && event.outcome.kind === "completed")
        void get(paseo)
          .then((e) =>
            e.onTurn(
              event.agent.workspaceId!,
              event.agent.id,
              !!event.agent.parentAgentId,
            ),
          )
          .catch(report);
    }),
  ];
  return async () => {
    stopped = true;
    removers.forEach((remove) => remove());
    await engine?.close();
  };
}
