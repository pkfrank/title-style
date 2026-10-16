Tiger titles gives Paseo workspaces short names with a recognizable subject and a specific action, such as “Atlas · Review launch copy”. New workspaces can be named automatically. Existing ones have a preview before applying a suggestion.

Open Tiger titles in the sidebar or type `/titles` in a workspace to preview a name, lock it, undo a change or search prior names. Manual changes observed outside the plugin lock the name. A primary agent owns each workspace title, so subagent activity does not replace the overall task name.

Requires Paseo 0.11.1 or later and a recent Claude Code installation for model-generated names. Tested with Claude Code 2.1.285. If Claude is unavailable or over quota, the plugin derives a local fallback title and does not launch another provider. Settings controls automatic naming and the naming instructions. Each host has its own installation and state.

The model receives short user objectives, the project name and the current title. Common secrets, email addresses and URLs are redacted from objectives; tool output and attachments are excluded. Redaction is best effort. Requests use a tool-free Claude Code call with project customizations and session persistence disabled. History is kept locally.

Haiku 4.5 is pinned as the only model. Automatic requests are deduplicated and limited to one at a time and a two-minute interval per workspace. There is no hourly cap. Reported costs are list-price estimates, not subscription charges.

Top-level agent tabs inherit the workspace title when their name is generic, such as `Resume session`, or still matches the workspace's prior title. Custom session names and subagent names are preserved. Changes follow user objectives rather than inferred completion status. Paseo's built-in namer is left enabled; its changes are conservatively preserved as outside edits. Paseo does not offer an atomic conditional rename, so a narrow read/write race remains despite stale-result checks.
