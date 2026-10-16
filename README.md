# Tiger titles

Short, recognizable Paseo workspace names such as `Atlas · Review launch copy`.
Forked from [zwmmm/title-style](https://github.com/zwmmm/title-style), retaining its MIT license.

## Use

Open **Tiger titles** in the sidebar, the Command Center, or type `/titles` in a workspace. New workspaces are enrolled automatically while naming is enabled. Existing workspaces stay preview-only until you apply a suggestion or enable automatic naming.

- **Preview** generates a suggestion without changing the name.
- **Apply suggestion** adopts it and enables future automatic updates unless the workspace is locked.
- **Lock / Unlock** controls automatic changes. An observed title change outside Tiger also locks it.
- **Undo and lock** restores the previous title and prevents an immediate automatic redo.
- **History** and search include prior names; the original name is retained separately from the last 20 changes.

Settings → Tiger titles controls automatic naming and the naming instructions. The subject stays stable during automatic updates. A primary agent owns the workspace name; sibling agents and subagents cannot redirect it. Naming follows substantive user objectives, never agent completion claims or idle status.

## Install

Requires Paseo 0.11.1 or later and a working local Claude Code login with Haiku 4.5 access. Tested with Claude Code 2.1.285. Older CLIs lacking `--safe-mode` are unsupported. Install only once per daemon, with the `tiger-titles` ID.

```sh
npm ci
npm run typecheck
npm test
paseo plugin install /absolute/path/to/title-style
```

`paseo plugin reload tiger-titles` picks up source changes. No daemon restart is needed. `paseo plugin disable tiger-titles` stops automation while keeping state and names. Installation is per host; installing on a laptop does not install it on another daemon.

## Model, data and limits

The server starts a tool-free Claude Code print call in a temporary directory using the existing local login. Haiku 4.5 is pinned; there is no fallback. Customizations, project instructions, skills, MCP servers, browser integration and session persistence are disabled for this call. Thinking is disabled. Requests have a 25-second timeout and bounded output; cleanup kills an in-flight call when the plugin stops.

Only the first and latest substantive user objectives (up to 800 characters each), project name, current title and naming instructions are sent. Tool output and attachments are excluded. Common token patterns, email addresses and URLs are redacted from objectives; this is best-effort redaction, not a sensitive-data classifier. Titles and project names are sent as metadata. History and input hashes are stored locally; raw objectives are not persisted by the plugin.

One call runs at a time. Automatic calls have a two-minute per-workspace cooldown and persistent input deduplication. There is no hourly cap; Haiku calls are cheap. Explicit previews bypass the cooldown. The screen reports list-price usage for successful generations; this is not a subscription invoice or a complete provider billing ledger.

State lives in `$PASEO_HOME/plugin-data/tiger-titles/state.json` (default `~/.paseo`). Settings use Paseo's typed settings API. Writes are serialized and atomic; a pending rename is journaled before changing Paseo so an interrupted update can be recovered and locked.

Paseo 0.11.1 does not expose an atomic compare-and-set title mutation or title-change provenance. Tiger rechecks before every write and rejects stale results, but there is still a narrow read/write race. It conservatively treats any outside title change, including Paseo's built-in namer, as an edit to preserve. If the built-in namer wins, unlock or preview in Tiger. The plugin does not disable Paseo's built-in naming model or account for its usage.

Automatic updates follow user objective changes, not inferred milestones from assistant prose. First/latest objectives are fetched from bounded timeline pages; if a recent objective cannot be found, generation stops with an error. Separate agent tabs are not renamed in this version: the public SDK offers workspace title changes but no agent-title setter. The changed names are the workspace/sidebar rows.

## Development and checks

```sh
npm run typecheck
npm test
npm run dev:ui
```

The UI harness at `http://127.0.0.1:4178` renders the actual React Native components with synthetic data. It is not a replacement Paseo client. Check wide and compact layouts, light/dark themes, preview/apply/lock/undo and search. Plugin runtime code uses only host-supplied UI modules; the web harness is excluded from the plugin's TypeScript/runtime graph.

`node dev/live-smoke.mjs` is an explicit integration check against the local daemon. It creates a disposable workspace and a Haiku agent, verifies automatic naming, undo and stale-preview rejection, then archives the workspace. It uses model quota. Unit tests do not call a model.

Use `paseo plugin logs tiger-titles` for lifecycle errors and the workspace row for specific failure reasons. CLI stderr and transcripts are never written to plugin logs.
