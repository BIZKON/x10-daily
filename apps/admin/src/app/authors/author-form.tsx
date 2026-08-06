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
        <Field
          label="Адрес страницы (slug)"
          required
          hint="Только латиница и дефисы"
          help="Кусок ссылки, по которому открывается страница автора: при значении founder адрес будет /author/founder. Менять после публикации не стоит — старая ссылка перестанет работать."
        >
          <TextInput
            name="slug"
            defaultValue={defaults?.slug}
            required
            maxLength={80}
            placeholder="founder"
          />
        </Field>
        <Field
          label="Имя"
          required
          help="Как автор подписан под статьями. Пишите так, как должно быть видно читателю: «Константин Сыров», а не логин."
        >
          <TextInput
            name="name"
            defaultValue={defaults?.name}
            required
            maxLength={120}
            placeholder="Основатель ProAgent AI"
          />
        </Field>
      </div>

      <Field
        label="Роль"
        required
        hint="Например: Основатель, Главный редактор, Приглашённый эксперт"
        help="Подпись под именем — она объясняет читателю, почему этому человеку стоит верить. Это НЕ права доступа: что человек может делать в системе, задаётся отдельно."
      >
        <TextInput name="role" defaultValue={defaults?.role} required maxLength={80} />
      </Field>

      <Field
        label="Описание"
        help="Пара предложений о человеке: чем занимается и почему разбирается в теме. Показывается на его странице. Можно оставить пустым — тогда будет только имя и роль."
      >
        <TextArea
          name="bio"
          defaultValue={defaults?.bio ?? ""}
          rows={4}
          placeholder="Кто это, что делает, почему ему доверяют."
        />
      </Field>

      <Field
        label="Фото"
        hint="Ссылка на картинку или загрузка файла"
        help="Фото автора: показывается в списке авторов и на его странице. Загруженный файл ляжет на наш сервер и получит постоянную ссылку. Оставите пустым — вместо фото будет кружок с первой буквой имени."
      >
        <ImageUrlField name="avatarUrl" defaultValue={defaults?.avatarUrl ?? ""} />
      </Field>

      <Field
        label="Цвет подписи"
        hint="Например #E63946"
        help="Цвет кружка с буквой, когда фото не загружено. Пустое поле — фирменный переход от красного к золотому. Трогайте, только если у автора есть свой цвет."
      >
        <TextInput
          name="bylineColor"
          defaultValue={defaults?.bylineColor ?? ""}
          maxLength={16}
          placeholder="#E63946"
        />
      </Field>

      <div className="space-y-3 border-t border-fence pt-4">
        <div>
          <CheckboxInput
            name="isStaff"
            label="Штатный автор"
            defaultChecked={defaults?.isStaff ?? false}
          />
          <p className="m-0 mt-1 pl-6 text-[11.5px] leading-[1.5] text-haze">
            Человек из вашей команды, а не приглашённый гость. Штатные авторы идут выше в списке.
          </p>
        </div>
        <div>
          <CheckboxInput
            name="isFlagship"
            label="Главный голос"
            defaultChecked={defaults?.isFlagship ?? false}
          />
          <p className="m-0 mt-1 pl-6 text-[11.5px] leading-[1.5] text-haze">
            Основной автор издания — от его лица идут личные разборы. Обычно он один.
          </p>
        </div>
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
