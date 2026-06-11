import { CheckboxInput, Field, TextArea, TextInput } from "@/components/form/field";
import { ImageUrlField } from "@/components/form/image-url-field";
import { SubmitButton } from "@/components/form/submit-button";
import type { AdminAuthor } from "@/lib/api";

/**
 * Form для create/edit автора. action прокидывается извне (createAuthor / updateAuthor.bind).
 */
export function AuthorForm({
  action,
  defaults,
  submitLabel = "Сохранить",
}: {
  action: (form: FormData) => void | Promise<void>;
  defaults?: Partial<AdminAuthor>;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Slug (URL)" required hint="Латиница, дефисы. Используется в /author/...">
          <TextInput
            name="slug"
            defaultValue={defaults?.slug}
            required
            maxLength={80}
            placeholder="igor-rybakov"
          />
        </Field>
        <Field label="Имя" required>
          <TextInput
            name="name"
            defaultValue={defaults?.name}
            required
            maxLength={120}
            placeholder="Игорь Рыбаков"
          />
        </Field>
      </div>

      <Field label="Роль" required hint='"Главный редактор", "Гость", "Игорь Рыбаков"'>
        <TextInput name="role" defaultValue={defaults?.role} required maxLength={80} />
      </Field>

      <Field label="Bio">
        <TextArea
          name="bio"
          defaultValue={defaults?.bio ?? ""}
          rows={4}
          placeholder="Кто это, что делает, почему ему доверяют."
        />
      </Field>

      <Field label="Avatar" hint="URL или загрузка с диска (R2)">
        <ImageUrlField name="avatarUrl" defaultValue={defaults?.avatarUrl ?? ""} />
      </Field>

      <Field label="Byline color" hint="Hex или CSS-цвет. По умолчанию red→gold градиент.">
        <TextInput
          name="bylineColor"
          defaultValue={defaults?.bylineColor ?? ""}
          maxLength={16}
          placeholder="#E63946"
        />
      </Field>

      <div className="flex flex-wrap gap-6 border-t border-fence pt-4">
        <CheckboxInput
          name="isStaff"
          label="Сотрудник редакции"
          defaultChecked={defaults?.isStaff ?? false}
        />
        <CheckboxInput
          name="isFlagship"
          label="Flagship (главный голос — Рыбаков)"
          defaultChecked={defaults?.isFlagship ?? false}
        />
      </div>

      <div className="flex justify-end border-t border-fence pt-4">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
