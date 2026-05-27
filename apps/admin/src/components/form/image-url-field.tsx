"use client";

import { Image as ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { uploadImage } from "@/app/upload-action";

/**
 * Combo-поле для URL изображения: текстовый input + загрузка с диска.
 *
 * Зачем wrapper? Server action в `author-form` / `event-form` читает `<input name>` —
 * нам нужно `<input type="hidden" name={name}>` синхронизированный с состоянием URL,
 * который меняется и от пользователя, и после успешной загрузки.
 *
 * Превью показывается если URL валидный (попытка отрендерить через <img>).
 */
export function ImageUrlField({
  name,
  defaultValue,
  placeholder = "https://...",
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set("file", file);
    startTransition(async () => {
      const res = await uploadImage(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUrl(res.url);
      // Очищаем file input чтобы можно было перезагрузить тот же файл.
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  };

  const clearUrl = () => {
    setUrl("");
    setError(null);
  };

  return (
    <div className="space-y-2">
      {/* Hidden input — это то, что читает server action. */}
      <input type="hidden" name={name} value={url} />

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-fence bg-night px-3 py-2 text-[14px] text-paper outline-none placeholder:text-haze focus:border-gold/60 focus:bg-card"
        />
        {url && (
          <button
            type="button"
            onClick={clearUrl}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-fence bg-night text-haze hover:text-red"
            aria-label="Очистить"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-fence bg-card px-3 py-1.5 text-[12px] font-semibold text-mist transition hover:border-gold/40 hover:text-paper"
        >
          {isPending ? (
            <>
              <Loader2 size={12} strokeWidth={2} className="animate-spin" /> Загрузка…
            </>
          ) : (
            <>
              <Upload size={12} strokeWidth={2} /> Загрузить файл
            </>
          )}
        </label>
        <input
          id={inputId}
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          onChange={onFileChange}
          disabled={isPending}
          className="hidden"
        />
        <span className="text-[11px] text-haze">PNG/JPEG/WebP/GIF/SVG, до 5 МБ</span>
      </div>

      {error && (
        <div className="rounded border border-red/40 bg-red/[0.06] px-3 py-2 text-[12px] text-red">
          {error}
        </div>
      )}

      {url && !error && (
        <div className="flex items-center gap-3 rounded-lg border border-fence bg-night p-2.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded border border-fence bg-card text-haze">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                // Если URL невалидный — скрываем картинку, оставляем иконку.
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <ImageIcon size={16} strokeWidth={1.5} className="-mt-12" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-mist" title={url}>
            {url}
          </span>
        </div>
      )}
    </div>
  );
}
