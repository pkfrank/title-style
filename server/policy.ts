import { createHash } from "node:crypto";
import { z } from "zod";
export type TextItem = { type: string; text?: string };
const ACK =
  /^(?:yes|yeah|yep|ok(?:ay)?|good|great|thanks|thank you|sure|please|go ahead|keep going|continue|do that|sounds good|perfect|solid|carry on)(?:[\s,.!;]+(?:and\s+)?(?:yes|yeah|ok(?:ay)?|good|great|thanks|please|go ahead|keep going|continue|do that|sounds good|perfect|solid|carry on))*[.!\s]*$/i;
export function isAcknowledgment(text: string) {
  return ACK.test(text.trim());
}
export function redact(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\b(?:sk-|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]+/g, "[secret]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(
      /(?:password|token|api[_ -]?key|secret)\s*[:=]\s*\S+/gi,
      "[secret]",
    )
    .replace(/[\u0000-\u001f]/g, " ");
}
export function sourceFrom(items: readonly TextItem[], fallback: string) {
  const users = items
    .filter((x) => x.type === "user_message" && x.text?.trim())
    .map((x) => x.text!.trim())
    .filter((x) => !isAcknowledgment(x));
  const first = users[0] ?? fallback;
  const last = users.at(-1) ?? first;
  // Only user-authored objectives. Tool output, attachments and agent claims never enter the model prompt.
  return {
    first: redact(first).slice(0, 800),
    latest: redact(last).slice(0, 800),
  };
}
export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export const answerSchema = z
  .object({ title: z.string().trim().min(5).max(45) })
  .strict();
export function parseTitle(value: unknown, stableSubject?: string) {
  const { title } = answerSchema.parse(value);
  if (
    /[\n\r\t<>`]|https?:|\b(?:done|verified|approved|ready for review|completed)\b/i.test(
      title,
    )
  )
    throw new Error("Model returned an unsuitable title.");
  const parts = title.split(" · ");
  if (
    parts.length !== 2 ||
    !parts.every((x) => x.trim()) ||
    parts[0].length > 24
  )
    throw new Error("Model did not return Subject · Action.");
  if (
    /^(?:Architecture|Investigation|Implementation|Discussion|Registration|Analysis)\b/i.test(
      parts[1],
    )
  )
    throw new Error(
      "Title action must start with a verb. Generate another preview.",
    );
  if (stableSubject && parts[0] !== stableSubject)
    throw new Error(
      "Model changed the stable subject; preview a new title explicitly.",
    );
  return title;
}
