import type {
  PluginClientContext,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Titles } from "./client/titles";
import { TitleStyleSettings } from "./client/title-style-settings";
function Sidebar({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="CaseSensitive"
      active={currentScreen?.screenId === "titles"}
      onPress={() => openScreen({ screenId: "titles" })}
    />
  );
}
export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "titles", title: "Tiger titles", Component: Titles });
  client.addSidebarHeaderItem({
    id: "titles",
    title: "Tiger titles",
    Component: Sidebar,
  });
  client.addWorkspacePanel({
    id: "titles",
    title: "Tiger titles",
    icon: "CaseSensitive",
    context: "workspace",
    Component: Titles,
  });
  client.addSettingsScreen({
    id: "naming",
    title: "Tiger titles",
    icon: "CaseSensitive",
    Component: TitleStyleSettings,
  });
  client.addCommandCenterItem({
    id: "titles",
    title: "Tiger titles: preview, lock or undo",
    icon: "CaseSensitive",
    context: "workspace",
    onSelect: ({ openPanel }) => openPanel("titles"),
  });
  client.addSlashCommand({
    name: "titles",
    argumentHint: "",
    description: "Preview, lock or undo workspace names",
    context: "workspace",
    onSubmit: ({ openPanel }) => openPanel("titles"),
  });
  return () => {};
}
