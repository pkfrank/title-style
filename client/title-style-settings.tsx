import { useEffect, useState } from "react";
import { Text, TextInput, View, Pressable } from "react-native";
import {
  useSettings,
  type PluginSurfaceProps,
  type SettingsState,
} from "@getpaseo/plugin/client";
import { titleStyleSettings } from "../shared/settings";
type Ready = Extract<
  SettingsState<typeof titleStyleSettings.schema>,
  { status: "ready" }
>;
function Editor({
  settings,
  theme,
}: {
  settings: Ready;
  theme: PluginSurfaceProps["theme"];
}) {
  const [instructions, setInstructions] = useState(
    settings.values.instructions,
  );
  const [revision, setRevision] = useState(settings.revision);
  useEffect(() => {
    if (instructions === settings.values.instructions)
      setRevision(settings.revision);
  }, [instructions, settings.values.instructions, settings.revision]);
  const [saved, setSaved] = useState(false);
  const text = { color: theme.colors.foreground };
  const button = {
    backgroundColor: theme.colors.surface2,
    padding: 12,
    borderRadius: 8,
  };
  return (
    <View style={{ gap: 16 }}>
      <Text style={text}>
        Haiku 4.5 through this host’s Claude Code login. No fallback model. One
        call at a time, with a {settings.values.cooldownSeconds}s interval per
        workspace.
      </Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: settings.values.enabled }}
        style={button}
        onPress={() => {
          void settings.save(
            { ...settings.values, enabled: !settings.values.enabled },
            settings.revision,
          );
        }}
      >
        <Text style={text}>
          Automatic naming: {settings.values.enabled ? "On" : "Off"}
        </Text>
      </Pressable>
      <Text style={text}>Naming instructions</Text>
      <TextInput
        accessibilityLabel="Naming instructions"
        multiline
        value={instructions}
        onChangeText={(value) => {
          setInstructions(value);
          setSaved(false);
        }}
        style={{
          ...text,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 8,
          padding: 12,
          minHeight: 180,
          textAlignVertical: "top",
        }}
      />
      <Pressable
        accessibilityRole="button"
        disabled={settings.saving}
        style={button}
        onPress={() => {
          void settings
            .save({ ...settings.values, instructions }, revision)
            .then(setSaved);
        }}
      >
        <Text style={text}>
          {settings.saving ? "Saving…" : "Save instructions"}
        </Text>
      </Pressable>
      {saved ? <Text style={text}>Saved.</Text> : null}
      {settings.saveError ? (
        <Text accessibilityRole="alert" style={text}>
          {settings.saveError} Close and reopen this screen to load the latest
          settings.
        </Text>
      ) : null}
      <Text style={{ color: theme.colors.foregroundMuted }}>
        Existing workspaces require Preview → Apply or Unlock before automatic
        naming. Manual title changes lock the name. Preview remains available
        when automatic naming is off. Input includes short, redacted user
        objectives; it excludes tool output and attachments. Redaction is best
        effort.
      </Text>
    </View>
  );
}
export function TitleStyleSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(titleStyleSettings);
  if (settings.status !== "ready")
    return (
      <Text style={{ color: theme.colors.foreground }}>
        {settings.status === "loading" ? "Loading…" : settings.error}
      </Text>
    );
  return <Editor settings={settings} theme={theme} />;
}
