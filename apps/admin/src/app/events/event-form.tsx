import { CheckboxInput, Field, SelectInput, TextArea, TextInput } from "@/components/form/field";
import { ImageUrlField } from "@/components/form/image-url-field";
import { SubmitButton } from "@/components/form/submit-button";
import type { AdminEvent } from "@/lib/api";

// "kod-x10" — мёртвое значение PG-enum (X10-наследие), новые события его не используют.
const TYPE_OPTIONS = [
  { value: "meet-up", label: "Митап" },
  { value: "breakfast", label: "Бизнес-завтрак" },
  { value: "festival", label: "Фестиваль" },
  { value: "webinar", label: "Вебинар" },
] as const;

/** ISO → "YYYY-MM-DDTHH:mm" для <input type="datetime-local">. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type EventDefaults = Partial<AdminEvent> & {
  venue?: { name: string; address: string; lat?: number; lng?: number } | null;
  description?: string;
  coverImageUrl?: string | null;
  ticketUrl?: string | null;
  timezone?: string;
  speakerIds?: string[];
};

export function EventForm({
  action,
  defaults,
  submitLabel = "Сохранить",
}: {
  action: (form: FormData) => void | Promise<void>;
  defaults?: EventDefaults;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Slug (URL)" required>
          <TextInput name="slug" defaultValue={defaults?.slug} required maxLength={120} />
        </Field>
        <Field label="Тип" required>
          <SelectInput
            name="type"
            defaultValue={defaults?.type ?? "meet-up"}
            options={TYPE_OPTIONS}
            required
          />
        </Field>
      </div>

      <Field label="Название" required>
        <TextInput name="title" defaultValue={defaults?.title} required maxLength={200} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Дата и время начала" required>
          <TextInput
            name="startDate"
            type="datetime-local"
            defaultValue={toLocalInput(defaults?.startDate)}
            required
          />
        </Field>
        <Field label="Дата и время окончания" hint="Опционально для однодневного">
          <TextInput
            name="endDate"
            type="datetime-local"
            defaultValue={toLocalInput(defaults?.endDate)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Город" hint="null для online">
          <TextInput
            name="city"
            defaultValue={defaults?.city ?? ""}
            maxLength={80}
            placeholder="Москва"
          />
        </Field>
        <Field label="Timezone" hint="IANA tz">
          <TextInput
            name="timezone"
            defaultValue={defaults?.timezone ?? "Europe/Moscow"}
            maxLength={40}
          />
        </Field>
        <Field label="Организатор" required>
          <TextInput name="organizer" defaultValue={defaults?.organizer} required maxLength={120} />
        </Field>
      </div>

      <Field
        label="Venue (JSON)"
        hint='Опционально: {"name": "Loft", "address": "Москва, ул. Льва Толстого 16", "lat": 55.74, "lng": 37.6}'
      >
        <TextArea
          name="venue"
          defaultValue={defaults?.venue ? JSON.stringify(defaults.venue, null, 2) : ""}
          rows={3}
          placeholder='{"name":"","address":""}'
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Цена от (₽)" hint="Пусто = бесплатно">
          <TextInput
            name="ticketPriceFrom"
            type="number"
            defaultValue={defaults?.ticketPriceFrom ?? ""}
          />
        </Field>
        <Field label="Capacity" hint="Пусто = без лимита">
          <TextInput name="capacity" type="number" defaultValue={defaults?.capacity ?? ""} />
        </Field>
      </div>

      <Field label="Ticket URL">
        <TextInput name="ticketUrl" type="url" defaultValue={defaults?.ticketUrl ?? ""} />
      </Field>

      <Field label="Обложка" hint="URL или загрузка с диска (R2)">
        <ImageUrlField name="coverImageUrl" defaultValue={defaults?.coverImageUrl ?? ""} />
      </Field>

      <Field label="Speaker IDs" hint="UUIDs через перевод строки или запятую">
        <TextArea
          name="speakerIds"
          defaultValue={defaults?.speakerIds?.join("\n") ?? ""}
          rows={3}
          placeholder="uuid-1&#10;uuid-2"
        />
      </Field>

      <Field label="Описание" required>
        <TextArea name="description" defaultValue={defaults?.description ?? ""} rows={6} required />
      </Field>

      <div className="border-t border-fence pt-4">
        <CheckboxInput
          name="isOnline"
          label="Online событие"
          defaultChecked={defaults?.isOnline ?? false}
        />
      </div>

      <div className="flex justify-end border-t border-fence pt-4">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
