"use client";

/**
 * HeaderShare — кнопка «Поделиться» в sticky-header.
 *
 * Без backend: использует Web Share API (нативный share-sheet на mobile).
 * Fallback на clipboard.writeText для desktop. Toast «Скопировано» на 1.5 с.
 */
import { Share2 } from "lucide-react";
import { useState } from "react";

export function HeaderShare({
  title,
  slug,
}: {
  title: string;
  slug: string;
}) {
  const [toast, setToast] = useState<string | null>(null);

  const handle = async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/article/${slug}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast("Скопировано");
      setTimeout(() => setToast(null), 1500);
    } catch {
      setToast("Не удалось");
      setTimeout(() => setToast(null), 1500);
    }
  };

  return (
    <button
      type="button"
      aria-label="Поделиться"
      onClick={handle}
      className="relative"
    >
      <Share2 size={20} strokeWidth={1.75} />
      {toast && (
        <span
          role="status"
          className="absolute -bottom-8 right-0 whitespace-nowrap rounded-md border border-fence bg-card px-2 py-1 text-[11px] text-paper shadow-lg"
        >
          {toast}
        </span>
      )}
    </button>
  );
}
