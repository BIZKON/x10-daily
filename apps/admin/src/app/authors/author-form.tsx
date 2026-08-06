"use client";

import { CheckboxInput, Field, TextArea, TextInput } from "@/components/form/field";
import { ImageUrlField } from "@/components/form/image-url-field";
import { SubmitButton } from "@/components/form/submit-button";
import type { AdminAuthor } from "@/lib/api";
import { Check } from "lucide-react";
import { useActionState } from "react";
import { AUTHOR_FORM_IDLE, type AuthorFormState } from "./form-state";

/**
 * Form для create/edit автора. action прокидывается извне (createAuthor /
 * updateAuthor.bind).
 *
 * 🔴 Клиентский компонент ради `useActionState`: сохранение обязано давать
 * видимый исход. Раньше экшен молчал на успехе и бросал на ошибке — редактор
 * жал кнопку повторно, считая, что она не работает (см. докблок в actions.ts).
 */
export function AuthorForm({
  action,
  defaults,
  submitLabel = "Сохранить",
}: {
  action: (prev: AuthorFormState, form: FormData) => Promise<AuthorFormState>;
  defaults?: Partial<AdminAuthor>;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, AUTHOR_FORM_IDLE);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Slug (URL)" required hint="Латиница, дефисы. Используется в /author/...">
          <TextInput
            name="slug"
            defaultValue={defaults?.slug}
            required
            maxLength={80}
            placeholder="founder"
          />
        </Field>
        <Field label="Имя" required>
          <TextInput
            name="name"
            defaultValue={defaults?.name}
            required
            maxLength={120}
            placeholder="Основатель ProAgent AI"
          />
        </Field>
      </div>

      <Field label="Роль" required hint='"Главный редактор", "Гость", "Основатель"'>
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

      <Field label="Avatar" hint="Ссылка или загрузка файла — файл ляжет на наш сервер">
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
          label="Flagship (главный голос — основатель)"
          defaultChecked={defaults?.isFlagship ?? false}
        />
      </div>

      {state.status === "error" && (
        <div className="rounded-lg border border-red/40 bg-red/[0.06] px-3 py-2 text-[13px] text-red">
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-fence pt-4">
        {state.status === "saved" && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-success">
            <Check size={14} strokeWidth={2.5} /> Сохранено
          </span>
        )}
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
