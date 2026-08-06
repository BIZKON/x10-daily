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
        <Field
          label="Адрес страницы (slug)"
          required
          hint="Только латиница и дефисы"
          help="Кусок ссылки, по которому открывается событие: при значении ai-meetup-moscow адрес будет /events/ai-meetup-moscow. После публикации лучше не менять — старая ссылка перестанет работать."
        >
          <TextInput name="slug" defaultValue={defaults?.slug} required maxLength={120} />
        </Field>
        <Field
          label="Тип события"
          required
          help="Определяет, как событие подписано в ленте. На доступ и рассылку не влияет."
        >
          <SelectInput
            name="type"
            defaultValue={defaults?.type ?? "meet-up"}
            options={TYPE_OPTIONS}
            required
          />
        </Field>
      </div>

      <Field
        label="Название"
        required
        help="Заголовок, который увидит читатель. Без кавычек и без слова «мероприятие» — сразу суть: «Как внедрить ИИ-агента в отдел продаж»."
      >
        <TextInput name="title" defaultValue={defaults?.title} required maxLength={200} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Начало"
          required
          help="Дата и время старта по часовому поясу, указанному ниже. Именно по этому полю событие попадает в ленту и уходит из неё, когда пройдёт."
        >
          <TextInput
            name="startDate"
            type="datetime-local"
            defaultValue={toLocalInput(defaults?.startDate)}
            required
          />
        </Field>
        <Field
          label="Окончание"
          hint="Можно не заполнять"
          help="Нужно только для многодневных событий — конференций, фестивалей. Для обычной встречи на пару часов оставьте пустым."
        >
          <TextInput
            name="endDate"
            type="datetime-local"
            defaultValue={toLocalInput(defaults?.endDate)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Город"
          hint="Пусто — событие только онлайн"
          help="Город, где событие проходит вживую. Если события офлайн нет вообще, оставьте пустым и поставьте галочку «Онлайн» внизу формы."
        >
          <TextInput
            name="city"
            defaultValue={defaults?.city ?? ""}
            maxLength={80}
            placeholder="Москва"
          />
        </Field>
        <Field
          label="Часовой пояс"
          hint="Europe/Moscow — Москва"
          help="В каком поясе указаны дата и время выше. Почти всегда Europe/Moscow. Меняйте, только если событие идёт в другом регионе: Asia/Yekaterinburg, Asia/Novosibirsk, Europe/Kaliningrad."
        >
          <TextInput
            name="timezone"
            defaultValue={defaults?.timezone ?? "Europe/Moscow"}
            maxLength={40}
          />
        </Field>
        <Field
          label="Организатор"
          required
          help="Кто проводит событие — компания или человек. Показывается читателю рядом с датой."
        >
          <TextInput name="organizer" defaultValue={defaults?.organizer} required maxLength={120} />
        </Field>
      </div>

      <Field
        label="Площадка"
        hint='Формат: {"name": "Лофт Позитив", "address": "Москва, ул. Льва Толстого 16"}'
        help={
          <>
            Адрес места проведения. Заполняется в техническом формате — скопируйте образец из
            подсказки и замените текст в кавычках. Поля <b>lat</b> и <b>lng</b> — координаты для
            карты, они не обязательны. Для онлайн-события оставьте пустым.
          </>
        }
      >
        <TextArea
          name="venue"
          defaultValue={defaults?.venue ? JSON.stringify(defaults.venue, null, 2) : ""}
          rows={3}
          placeholder='{"name":"","address":""}'
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Цена от, ₽"
          hint="Пусто — вход бесплатный"
          help="Минимальная цена билета. Показывается как «от 3000 ₽». Если билеты бесплатные, оставьте пустым — читатель увидит «Бесплатно»."
        >
          <TextInput
            name="ticketPriceFrom"
            type="number"
            defaultValue={defaults?.ticketPriceFrom ?? ""}
          />
        </Field>
        <Field
          label="Сколько мест"
          hint="Пусто — без ограничения"
          help="Вместимость площадки. Нужно, чтобы показать читателю, что мест мало. Система места не считает и запись не закрывает — это справочная цифра."
        >
          <TextInput name="capacity" type="number" defaultValue={defaults?.capacity ?? ""} />
        </Field>
      </div>

      <Field
        label="Ссылка на билеты"
        hint="Полный адрес, начиная с https://"
        help="Куда ведёт кнопка регистрации: ваш лендинг, форма или сервис билетов. Оставите пустым — кнопки не будет."
      >
        <TextInput name="ticketUrl" type="url" defaultValue={defaults?.ticketUrl ?? ""} />
      </Field>

      <Field
        label="Обложка"
        hint="Ссылка на картинку или загрузка файла"
        help="Картинка события в ленте. Загруженный файл ляжет на наш сервер и получит постоянную ссылку. Лучше горизонтальная, примерно 16:9."
      >
        <ImageUrlField name="coverImageUrl" defaultValue={defaults?.coverImageUrl ?? ""} />
      </Field>

      <Field
        label="Спикеры"
        hint="По одному коду в строке"
        help={
          <>
            Кто выступает. Указываются <b>кодами авторов</b>, а не именами: откройте раздел
            «Авторы», зайдите в нужного человека и скопируйте код из адресной строки. Спикер должен
            быть заведён как автор. Не знаете кодов — оставьте пустым, событие опубликуется без
            списка выступающих.
          </>
        }
      >
        <TextArea
          name="speakerIds"
          defaultValue={defaults?.speakerIds?.join("\n") ?? ""}
          rows={3}
          placeholder="uuid-1&#10;uuid-2"
        />
      </Field>

      <Field
        label="Описание"
        required
        help="О чём событие и зачем на него идти. Пишите для читателя: что он унесёт с собой. Показывается на странице события целиком."
      >
        <TextArea name="description" defaultValue={defaults?.description ?? ""} rows={6} required />
      </Field>

      <div className="border-t border-fence pt-4">
        <CheckboxInput
          name="isOnline"
          label="Онлайн"
          defaultChecked={defaults?.isOnline ?? false}
        />
        <p className="m-0 mt-1 pl-6 text-[11.5px] leading-[1.5] text-haze">
          Участвовать можно из любой точки — трансляция, зум, вебинар. Тогда город и площадку
          заполнять не нужно.
        </p>
      </div>

      <div className="flex justify-end border-t border-fence pt-4">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
