import { CheckboxInput, Field, TextArea, TextInput } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import type { AdminKlamp } from "@/lib/api";

export function KlampForm({
  action,
  defaults,
  submitLabel = "Сохранить",
}: {
  action: (form: FormData) => void | Promise<void>;
  defaults?: Partial<AdminKlamp>;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Slug (URL)" required>
          <TextInput
            name="slug"
            defaultValue={defaults?.slug}
            required
            maxLength={80}
            placeholder="digital-breakthrough-krd"
          />
        </Field>
        <Field label="Название" required>
          <TextInput
            name="name"
            defaultValue={defaults?.name}
            required
            maxLength={120}
            placeholder="Кламп «Цифровой прорыв»"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Город" required>
          <TextInput
            name="city"
            defaultValue={defaults?.city}
            required
            maxLength={80}
            placeholder="Краснодар"
          />
        </Field>
        <Field label="Страна" hint="2-4 буквы (РФ, KZ, AE)">
          <TextInput name="country" defaultValue={defaults?.country ?? "РФ"} maxLength={4} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Лидер" required>
          <TextInput
            name="leadName"
            defaultValue={defaults?.leadName}
            required
            maxLength={120}
            placeholder="Алексей Петров"
          />
        </Field>
        <Field label="Контакт лидера" hint="TG / email / телефон">
          <TextInput
            name="leadContact"
            defaultValue={(defaults as { leadContact?: string | null })?.leadContact ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Расписание встреч" required hint='"каждый второй четверг 19:00"'>
          <TextInput
            name="meetingSchedule"
            defaultValue={defaults?.meetingSchedule}
            required
            maxLength={200}
          />
        </Field>
        <Field label="Участников" hint="Денормализованное число, обновляй вручную">
          <TextInput name="memberCount" type="number" defaultValue={defaults?.memberCount ?? 0} />
        </Field>
      </div>

      <Field label="Цель клампа" hint="Опционально — конкретная цель на 90 дней">
        <TextInput
          name="goal"
          defaultValue={defaults?.goal ?? ""}
          placeholder="Запустить совместный AI-сервис за 90 дней"
        />
      </Field>

      <Field label="Описание">
        <TextArea name="description" defaultValue={defaults?.description ?? ""} rows={4} />
      </Field>

      <div className="border-t border-fence pt-4">
        <CheckboxInput
          name="isOpen"
          label="Принимает новых участников"
          defaultChecked={defaults?.isOpen ?? true}
        />
      </div>

      <div className="flex justify-end border-t border-fence pt-4">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
