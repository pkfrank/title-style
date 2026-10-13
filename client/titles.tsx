import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  useRpc,
  type PluginScreenProps,
  type PluginWorkspacePanelProps,
  type PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import { changeTitle, listTitles, type TitleRow } from "../shared/contracts";
export function Titles(props: PluginScreenProps | PluginWorkspacePanelProps) {
  const { theme, layout } = props;
  const workspaceId = "workspaceId" in props ? props.workspaceId : undefined;
  const list = useRpc(listTitles),
    change = useRpc(changeTitle);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["tiger-titles", "list"],
    queryFn: () => list({}),
    refetchInterval: (query) =>
      query.state.data?.rows.some((row) => row.busy) ? 2000 : 15000,
  });
  const mutation = useMutation({
    mutationFn: change,
    onSuccess: () => {
      setError(null);
      void query.refetch();
    },
    onError: (e: Error) => {
      setError(e.message);
      void query.refetch();
    },
  });
  const text = { color: theme.colors.foreground },
    muted = { color: theme.colors.foregroundMuted };
  const rows = query.data?.rows.filter(
    (row) =>
      (!workspaceId || row.id === workspaceId) &&
      [
        row.name,
        row.original,
        row.project,
        ...row.history.flatMap((h) => [h.before, h.after]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 16 : 28, gap: 16 }}
    >
      <Text style={{ ...text, fontSize: 24, fontWeight: "600" }}>
        Names you can navigate
      </Text>
      <Text style={muted}>
        Keep the subject recognizable and the next action clear. Preview changes
        before applying them to existing workspaces.
      </Text>
      {query.data ? (
        <Text style={muted}>
          Haiku 4.5 · {query.data.calls} calls in the last hour · $
          {query.data.estimatedUsd.toFixed(4)} estimated list-price usage since
          install
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel="Search titles and history"
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setLimit(30);
        }}
        placeholder="Search titles and history"
        placeholderTextColor={theme.colors.foregroundMuted}
        style={{
          ...text,
          padding: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 8,
        }}
      />
      {query.isPending ? <Text style={text}>Loading workspaces…</Text> : null}
      {error || query.error ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={text}>
            {error || query.error?.message}
          </Text>
          <Button
            theme={theme}
            label="Refresh"
            onPress={() => {
              setError(null);
              void query.refetch();
            }}
          />
        </View>
      ) : null}
      {rows?.length === 0 ? (
        <Text style={muted}>No matching workspaces.</Text>
      ) : null}
      {rows?.slice(0, limit).map((row) => (
        <TitleCard
          key={row.id}
          row={row}
          theme={theme}
          pending={mutation.isPending}
          act={(action) =>
            mutation.mutate({
              workspaceId: row.id,
              revision: row.revision,
              action,
            })
          }
        />
      ))}
      {rows && rows.length > limit ? (
        <Button
          theme={theme}
          label={`Show more (${rows.length - limit} remaining)`}
          onPress={() => setLimit(limit + 30)}
        />
      ) : null}
    </ScrollView>
  );
}
function Button({
  label,
  onPress,
  theme,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  theme: PluginSurfaceProps["theme"];
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: theme.colors.surface2,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ color: theme.colors.foreground, fontWeight: "500" }}>
        {label}
      </Text>
    </Pressable>
  );
}
function TitleCard({
  row,
  theme,
  pending,
  act,
}: {
  row: TitleRow;
  theme: PluginSurfaceProps["theme"];
  pending: boolean;
  act: (action: "preview" | "apply" | "lock" | "unlock" | "undo") => void;
}) {
  const [history, setHistory] = useState(false);
  const text = { color: theme.colors.foreground };
  const muted = { color: theme.colors.foregroundMuted };
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 12,
        padding: 16,
        gap: 12,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <Text style={{ ...text, fontSize: 17, fontWeight: "600" }}>
        {row.name}
      </Text>
      <Text style={muted}>
        {row.project} ·{" "}
        {row.locked ? "Locked" : row.managed ? "Automatic" : "Preview only"}
        {row.busy ? " · Naming…" : ""}
      </Text>
      {row.proposal ? (
        <View style={{ gap: 4 }}>
          <Text style={muted}>Suggested title</Text>
          <Text style={{ ...text, fontSize: 17 }}>{row.proposal}</Text>
        </View>
      ) : null}
      {row.error ? (
        <Text accessibilityRole="alert" style={muted}>
          {row.error}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button
          theme={theme}
          label={row.busy ? "Naming…" : "Preview"}
          disabled={pending || row.busy}
          onPress={() => act("preview")}
        />
        {row.proposal ? (
          <Button
            theme={theme}
            label="Apply suggestion"
            disabled={pending || row.busy}
            onPress={() => act("apply")}
          />
        ) : null}
        <Button
          theme={theme}
          label={
            row.locked ? "Unlock" : row.managed ? "Lock" : "Enable automatic"
          }
          disabled={pending}
          onPress={() => act(row.locked || !row.managed ? "unlock" : "lock")}
        />
        {row.history.length > 0 ? (
          <Button
            theme={theme}
            label="Undo and lock"
            disabled={
              pending ||
              row.history[0].kind === "undo" ||
              row.history[0].after !== row.name
            }
            onPress={() => act("undo")}
          />
        ) : null}
        {row.history.length > 0 ? (
          <Button
            theme={theme}
            label={history ? "Hide history" : "History"}
            onPress={() => setHistory(!history)}
          />
        ) : null}
      </View>
      {history
        ? row.history.map((entry, i) => (
            <Text key={`${entry.at}-${i}`} style={muted}>
              {new Date(entry.at).toLocaleString()} · {entry.before} →{" "}
              {entry.after}
            </Text>
          ))
        : null}
    </View>
  );
}
