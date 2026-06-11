import { PodcastOfWeek } from "@/components/podcast-of-week";
import { TopBar } from "@/components/top-bar";
import { VIDEOS, VIDEO_TABS } from "@/lib/feed";
import { cn } from "@x10/ui";
import { Play } from "lucide-react";
import Image from "next/image";

export default function VideoPage() {
  return (
    <>
      <TopBar title="Видео и подкасты" />

      <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {VIDEO_TABS.map((t, i) => (
          <button
            key={t}
            type="button"
            className={cn(
              "whitespace-nowrap rounded-pill px-4 py-2 text-[13px] font-semibold",
              i === 0 ? "bg-red text-white" : "border border-fence bg-card text-mist",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <PodcastOfWeek />

      <section className="flex flex-col gap-3.5 px-4 pb-6">
        {VIDEOS.map((v) => (
          <article
            key={v.title}
            className="overflow-hidden rounded-[20px] border border-fence bg-card active:scale-[0.99]"
          >
            <div className="relative">
              <Image
                src={v.imageUrl}
                alt=""
                width={800}
                height={400}
                className="h-44 w-full object-cover"
                unoptimized
              />
              <div className="absolute inset-0 grid place-items-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-black/50 backdrop-blur-md">
                  <Play
                    size={20}
                    strokeWidth={2.25}
                    fill="currentColor"
                    className="ml-0.5 text-white"
                  />
                </span>
              </div>
              <span
                className={cn(
                  "absolute bottom-3 right-3 flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold text-white",
                  v.live ? "bg-red" : "bg-black/75",
                )}
              >
                {v.live && (
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                )}
                {v.duration}
              </span>
            </div>
            <div className="p-3.5">
              <h4 className="m-0 font-display text-[15px] font-extrabold leading-[1.3]">
                {v.title}
              </h4>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-haze">
                <span>{v.views} просмотров</span>
                <span>·</span>
                <span>{v.date}</span>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
