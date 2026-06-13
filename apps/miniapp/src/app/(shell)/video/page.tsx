import { Play } from "lucide-react";
import Image from "next/image";
import { connection } from "next/server";
import { Suspense } from "react";
import { TopBar } from "@/components/top-bar";
import { loadVideos } from "@/lib/feed";

export default function VideoPage() {
  return (
    <>
      <TopBar title="Видео" />
      <section className="px-4 py-5">
        <Suspense fallback={<VideoSkeleton />}>
          <VideoFeed />
        </Suspense>
      </section>
    </>
  );
}

/**
 * Реальные видео с YouTube-канала «Игорь Рыбаков» (RSS на бэкенде). PPR-дыра:
 * connection() в Suspense. Карточка ведёт на YouTube (внешняя ссылка — TG
 * webview откроет в браузере/приложении). Пусто/API down → честный empty.
 */
async function VideoFeed() {
  await connection();
  const videos = await loadVideos();

  if (videos.length === 0) {
    return (
      <div className="rounded-[20px] border border-fence bg-card px-4 py-12 text-center">
        <p className="m-0 font-display text-sm font-bold text-paper">Видео скоро появятся</p>
        <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-haze">
          Свежие выпуски с канала Игоря Рыбакова подтянутся здесь.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {videos.map((v) => (
        <a
          key={v.id}
          href={v.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-[20px] border border-fence bg-card transition-transform active:scale-[0.99]"
        >
          <div className="relative">
            <Image
              src={v.thumbnailUrl}
              alt=""
              width={800}
              height={450}
              className="h-48 w-full object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-night/40 to-transparent" />
            <div className="absolute inset-0 grid place-items-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 backdrop-blur-md">
                <Play size={20} strokeWidth={2.25} fill="currentColor" className="ml-0.5 text-white" />
              </span>
            </div>
          </div>
          <div className="p-3.5">
            <h4 className="m-0 line-clamp-2 font-display text-[15px] font-extrabold leading-[1.3]">
              {v.title}
            </h4>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-haze">
              <span className="font-semibold text-red">YouTube</span>
              {v.dateLabel && (
                <>
                  <span>·</span>
                  <span>{v.dateLabel}</span>
                </>
              )}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function VideoSkeleton() {
  return (
    <div className="flex flex-col gap-3.5" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-72 animate-pulse rounded-[20px] border border-fence bg-card"
        />
      ))}
    </div>
  );
}
