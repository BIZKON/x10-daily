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
      <Field
        label="Дата выпуска"
        required
        hint="Один выпуск на дату"
        help="За какой день этот выпуск. Дата — его уникальный номер: два выпуска за одно число завести нельзя."
      >
        <TextInput name="issueDate" type="date" defaultValue={defaults?.issueDate ?? ""} required />
      </Field>

      <Field
        label="Вступление"
        required
        hint="1–2 предложения"
        help="Первое, что читают в выпуске: приветствие и о чём сегодня. Коротко и по делу — длинное вступление пролистывают."
      >
        <TextArea name="intro" defaultValue={defaults?.intro ?? ""} rows={3} required />
      </Field>

      <Field
        label="Статьи выпуска"
        required
        hint="По одному коду в строке, от 1 до 10"
        help={
          <>
            Какие статьи войдут в выпуск. Указываются <b>кодами</b>, а не заголовками: откройте
            статью в разделе «Очередь» и скопируйте код из адресной строки. <b>Порядок важен</b> — в
            каком порядке впишете, в таком читатель их и увидит. Первая строка — главный материал
            дня.
          </>
        }
      >
        <TextArea
          name="topArticleIds"
          defaultValue={defaults?.topArticleIds?.join("\n") ?? ""}
          rows={6}
          required
          placeholder="uuid-1&#10;uuid-2&#10;uuid-3"
        />
      </Field>

      {/* Имя поля rybakovTake — API-контракт (jsonb-колонка digests.rybakov_take), не переименовываем. */}
      <Field
        label="Разбор от основателя"
        hint='Формат: {"quote": "сама мысль", "context": "к чему она"}'
        help={
          <>
            Личный комментарий основателя к событию дня — то, чего нет в новостях. <b>quote</b> —
            сама мысль, <b>context</b> — к какой ситуации она относится. Заполняется в техническом
            формате: скопируйте образец из подсказки и замените текст в кавычках. Можно оставить
            пустым — выпуск выйдет без этого блока.
          </>
        }
      >
        <TextArea
          name="rybakovTake"
          defaultValue={defaults?.rybakovTake ? JSON.stringify(defaults.rybakovTake, null, 2) : ""}
          rows={4}
        />
      </Field>

      <Field
        label="Анонс платного материала"
        hint='Формат: {"title": "заголовок", "articleId": "код статьи"}'
        help={
          <>
            Врезка со ссылкой на материал, ради которого стоит подписаться. <b>title</b> — как
            назвать его в выпуске, <b>articleId</b> — код самой статьи. Заполняется в техническом
            формате: скопируйте образец и замените текст в кавычках. Нет платных материалов —
            оставьте пустым.
          </>
        }
      >
        <TextArea
          name="premiumTeaser"
          defaultValue={
            defaults?.premiumTeaser ? JSON.stringify(defaults.premiumTeaser, null, 2) : ""
          }
          rows={3}
        />
      </Field>

      <Field
        label="Что завтра"
        hint="Одна фраза"
        help="Крючок на следующий выпуск: о чём будет завтра. Читается последним и удерживает читателя. Можно оставить пустым."
      >
        <TextInput name="tomorrow" defaultValue={defaults?.tomorrow ?? ""} />
      </Field>

      <div className="flex justify-end border-t border-fence pt-4">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
