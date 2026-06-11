import { Field, TextArea, TextInput } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import type { AdminDigest } from "@/lib/api";

type DigestDefaults = Partial<AdminDigest> & {
  rybakovTake?: { quote: string; context: string } | null;
  premiumTeaser?: { title: string; articleId: string } | null;
};

export function DigestForm({
  action,
  defaults,
  submitLabel = "Сохранить",
}: {
  action: (form: FormData) => void | Promise<void>;
  defaults?: DigestDefaults;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <Field label="Дата выпуска (YYYY-MM-DD)" required hint="Уникальная — один digest на дату.">
        <TextInput name="issueDate" type="date" defaultValue={defaults?.issueDate ?? ""} required />
      </Field>

      <Field label="Intro" required hint="Приветствие + дата. 1-2 предложения.">
        <TextArea name="intro" defaultValue={defaults?.intro ?? ""} rows={3} required />
      </Field>

      <Field
        label="Top article IDs"
        required
        hint="UUIDs через перевод строки или запятую. Порядок важен — это очерёдность в дайджесте. Min 1, max 10."
      >
        <TextArea
          name="topArticleIds"
          defaultValue={defaults?.topArticleIds?.join("\n") ?? ""}
          rows={6}
          required
          placeholder="uuid-1&#10;uuid-2&#10;uuid-3"
        />
      </Field>

      <Field label="Rybakov take (JSON)" hint='Опционально: {"quote": "...", "context": "..."}'>
        <TextArea
          name="rybakovTake"
          defaultValue={defaults?.rybakovTake ? JSON.stringify(defaults.rybakovTake, null, 2) : ""}
          rows={4}
        />
      </Field>

      <Field
        label="Premium teaser (JSON)"
        hint='Опционально: {"title": "...", "articleId": "uuid"}'
      >
        <TextArea
          name="premiumTeaser"
          defaultValue={
            defaults?.premiumTeaser ? JSON.stringify(defaults.premiumTeaser, null, 2) : ""
          }
          rows={3}
        />
      </Field>

      <Field label="Tomorrow" hint="Анонс завтрашнего выпуска (1 фраза)">
        <TextInput name="tomorrow" defaultValue={defaults?.tomorrow ?? ""} />
      </Field>

      <div className="flex justify-end border-t border-fence pt-4">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
