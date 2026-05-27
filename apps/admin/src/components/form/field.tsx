import type { ReactNode } from "react";

const FIELD_BASE =
  "w-full rounded-lg border border-fence bg-night px-3 py-2 text-[14px] text-paper outline-none placeholder:text-haze focus:border-gold/60 focus:bg-card";

/** Обёртка с label + помощник под error/hint. */
export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold text-mist">
        {label}
        {required && <span className="text-red">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-haze">{hint}</span>}
    </label>
  );
}

export function TextInput({
  name,
  defaultValue,
  placeholder,
  type = "text",
  required,
  maxLength,
  id,
}: {
  name: string;
  defaultValue?: string | number;
  placeholder?: string;
  type?: "text" | "url" | "number" | "datetime-local" | "date" | "email";
  required?: boolean;
  maxLength?: number;
  id?: string;
}) {
  return (
    <input
      id={id ?? name}
      name={name}
      type={type}
      defaultValue={defaultValue}
      placeholder={placeholder}
      required={required}
      maxLength={maxLength}
      className={FIELD_BASE}
    />
  );
}

export function TextArea({
  name,
  defaultValue,
  placeholder,
  rows = 4,
  required,
  id,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  id?: string;
}) {
  return (
    <textarea
      id={id ?? name}
      name={name}
      defaultValue={defaultValue}
      placeholder={placeholder}
      rows={rows}
      required={required}
      className={`${FIELD_BASE} resize-y font-mono text-[13px]`}
    />
  );
}

export function SelectInput({
  name,
  defaultValue,
  options,
  required,
  id,
}: {
  name: string;
  defaultValue?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  required?: boolean;
  id?: string;
}) {
  return (
    <select
      id={id ?? name}
      name={name}
      defaultValue={defaultValue}
      required={required}
      className={FIELD_BASE}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function CheckboxInput({
  name,
  label,
  defaultChecked,
  id,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  id?: string;
}) {
  return (
    <label
      htmlFor={id ?? name}
      className="flex cursor-pointer items-center gap-2 text-[13px] text-paper"
    >
      <input
        id={id ?? name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-fence bg-night accent-red"
      />
      {label}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red/40 bg-red/[0.06] px-4 py-3 text-[13px] text-red">
      {message}
    </div>
  );
}
