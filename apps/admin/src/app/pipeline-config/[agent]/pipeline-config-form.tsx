import { CheckboxInput, Field, SelectInput, TextInput } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import type { AdminPipelineConfig } from "@/lib/api";

/**
 * 3 поля: enabled / modelOverride / confidenceThreshold.
 * params jsonb пока не редактируем (отдельная задача).
 */

const MODEL_OPTIONS = [
  { value: "", label: "По умолчанию (model из кода агента)" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7 ($5 / $25 per Mtok)" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 ($3 / $15)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 ($1 / $5)" },
] as const;

export function PipelineConfigForm({
  action,
  defaults,
}: {
  action: (form: FormData) => void | Promise<void>;
  defaults: AdminPipelineConfig;
}) {
  return (
    <form action={action} className="space-y-5">
      <Field
        label="Включён"
        hint="Когда выключен — workflow пропускает этого агента (downstream-агенты не получают его outputs)."
      >
        <CheckboxInput
          name="enabled"
          label="Агент выполняется в workflow"
          defaultChecked={defaults.enabled}
        />
      </Field>

      <Field
        label="Model override"
        htmlFor="modelOverride"
        hint="«По умолчанию» = модель из кода (см. packages/agents/src/agents/). Override — для эксперимента или экономии."
      >
        <SelectInput
          id="modelOverride"
          name="modelOverride"
          defaultValue={defaults.modelOverride ?? ""}
          options={MODEL_OPTIONS}
        />
      </Field>

      <Field
        label="Confidence threshold"
        htmlFor="confidenceThreshold"
        hint="0..1. Используется в score/factcheck для halt-decisions. Default 0.700."
      >
        <TextInput
          id="confidenceThreshold"
          name="confidenceThreshold"
          type="number"
          defaultValue={Number.parseFloat(defaults.confidenceThreshold).toFixed(3)}
        />
      </Field>

      <div className="flex justify-end border-t border-fence pt-4">
        <SubmitButton label="Сохранить" />
      </div>
    </form>
  );
}
