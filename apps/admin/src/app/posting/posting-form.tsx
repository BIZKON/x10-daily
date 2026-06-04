import { CheckboxInput, Field, TextInput } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import type { PostingControl } from "@/lib/api";

/**
 * Стоп-кран автопостинга: ручная пауза + тихие часы (МСК). Один submit.
 * Конвейер читает конфиг на лету — эффект мгновенный.
 */
export function PostingForm({
  action,
  defaults,
}: {
  action: (form: FormData) => void | Promise<void>;
  defaults: PostingControl;
}) {
  return (
    <form action={action} className="space-y-5">
      <Field
        label="Стоп-кран"
        hint="Мгновенно останавливает весь автономный конвейер (генерацию и постинг), пока включено. Не зависит от расписания."
      >
        <CheckboxInput
          name="paused"
          label="Пауза сейчас — конвейер не работает"
          defaultChecked={defaults.paused}
        />
      </Field>

      <Field
        label="Тихие часы (МСК)"
        hint="В окне ниже конвейер не работает: ни генерации, ни постинга, ни трат. Окно может переходить через полночь (напр. 21 → 9)."
      >
        <CheckboxInput
          name="quietEnabled"
          label="Включить тихие часы по расписанию"
          defaultChecked={defaults.quietEnabled}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="С часа (МСК)" htmlFor="quietStartHour" hint="0–23">
          <TextInput
            id="quietStartHour"
            name="quietStartHour"
            type="number"
            defaultValue={defaults.quietStartHour}
          />
        </Field>
        <Field label="До часа (МСК)" htmlFor="quietEndHour" hint="0–23, эксклюзивно">
          <TextInput
            id="quietEndHour"
            name="quietEndHour"
            type="number"
            defaultValue={defaults.quietEndHour}
          />
        </Field>
      </div>

      <div className="flex justify-end border-t border-fence pt-4">
        <SubmitButton label="Сохранить" />
      </div>
    </form>
  );
}
