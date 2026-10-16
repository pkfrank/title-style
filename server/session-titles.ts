const GENERIC_SESSION_TITLE =
  /^(?:(?:resume|continue|start|new|open)(?: this| the)? session|session(?: \d+)?)$/i;

export function isGenericSessionTitle(title: string | null | undefined) {
  const value = title?.trim() ?? "";
  return !value || GENERIC_SESSION_TITLE.test(value);
}

export function shouldFollowWorkspaceTitle(
  agentTitle: string | null | undefined,
  workspaceTitle: string,
) {
  const value = agentTitle?.trim() ?? "";
  return isGenericSessionTitle(value) || value === workspaceTitle;
}
