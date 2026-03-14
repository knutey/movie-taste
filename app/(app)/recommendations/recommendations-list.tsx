"use client";

import { useState, useCallback, useRef, useId, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ChevronLeft } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { GENRES } from "@/app/(app)/get-started/genre/constants";
import { STREAMING_SERVICES } from "@/app/(app)/get-started/streaming-services/constants";
import type { RecommendationItem } from "@/app/(app)/dashboard/recommendations-actions";
import { getRecommendations } from "@/app/(app)/dashboard/recommendations-actions";
import { getItemAppGenreIds } from "@/lib/taste-diffs";
import { getRatingEmoji } from "@/components/rating-face";
import { rateRecommendation } from "./actions";

function clampRating(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const PAGE_SIZE = 20;

const GENRE_MAP = new Map<number, string>(
  GENRES.map((g) => [g.id, g.label])
);
const SERVICE_MAP = new Map<string, string>(
  STREAMING_SERVICES.map((s) => [s.id, s.label])
);

function genreLabels(ids: number[] | null): string[] {
  if (!ids) return [];
  return ids
    .map((id) => GENRE_MAP.get(id))
    .filter((l): l is string => l != null);
}

function serviceLabels(ids: string[]): string[] {
  return ids
    .map((id) => SERVICE_MAP.get(id))
    .filter((l): l is string => l != null);
}

function SkeletonRow() {
  return (
    <div className="rounded-2xl glass-subtle p-4">
      <div className="flex gap-4">
        <div className="w-20 h-[120px] rounded-lg bg-glass-bg animate-skeleton shrink-0" />
        <div className="flex-1 min-w-0 space-y-2.5 py-1">
          <div className="h-5 w-3/4 rounded bg-glass-bg animate-skeleton" />
          <div className="h-4 w-1/4 rounded bg-glass-bg animate-skeleton" />
          <div className="h-3 w-1/2 rounded bg-glass-bg animate-skeleton" />
          <div className="h-3 w-1/3 rounded bg-glass-bg animate-skeleton" />
        </div>
        <div className="flex flex-col items-end justify-between shrink-0 py-1">
          <div className="space-y-1.5">
            <div className="h-3 w-10 rounded bg-glass-bg animate-skeleton" />
            <div className="h-6 w-8 rounded bg-glass-bg animate-skeleton" />
          </div>
          <div className="h-9 w-16 rounded-full bg-glass-bg animate-skeleton" />
        </div>
      </div>
    </div>
  );
}

const thumbCenterPx = (trackWidth: number, draftRating: number) =>
  trackWidth > 22
    ? 11 + ((trackWidth - 22) * draftRating) / 100
    : (trackWidth * draftRating) / 100;
const thumbCenterPct = (trackWidth: number, draftRating: number) =>
  trackWidth > 22
    ? (thumbCenterPx(trackWidth, draftRating) / trackWidth) * 100
    : draftRating;
const halfFacePct = (trackWidth: number) =>
  trackWidth > 0 ? (25 / trackWidth) * 100 : 8;
const faceLeftPercent = (
  trackWidth: number,
  draftRating: number,
  hasUserMovedSlider: boolean
) => {
  const pct = thumbCenterPct(trackWidth, draftRating);
  const half = halfFacePct(trackWidth);
  return Math.max(half, Math.min(100 - half, pct));
};

type RecommendationRatingSliderProps = {
  draftRating: number;
  setDraftRating: (n: number) => void;
  hasUserMovedSlider: boolean;
  setHasUserMovedSlider: (b: boolean) => void;
  savingRating: boolean;
  savedForItemKey: string | null;
  itemKeyVal: string;
  trackWidth: number;
  sliderTrackRef: React.RefObject<HTMLDivElement | null>;
  ratingSliderId: string;
  pointerStartedOnSliderRef: React.MutableRefObject<boolean>;
  confirmTimeoutRef: React.MutableRefObject<number | null>;
  onCommit: (rating: number) => void;
};

function RecommendationRatingSlider({
  draftRating,
  setDraftRating,
  hasUserMovedSlider,
  setHasUserMovedSlider,
  savingRating,
  savedForItemKey,
  itemKeyVal,
  trackWidth,
  sliderTrackRef,
  ratingSliderId,
  pointerStartedOnSliderRef,
  confirmTimeoutRef,
  onCommit,
}: RecommendationRatingSliderProps) {
  const sliderZoneRef = useRef<HTMLDivElement>(null);
  const gestureDraftRef = useRef(draftRating);
  const inputDocUpRef = useRef<(() => void) | null>(null);
  const inputDocCancelRef = useRef<(() => void) | null>(null);

  const faceLeft = faceLeftPercent(trackWidth, draftRating, hasUserMovedSlider);
  const showSaved = savedForItemKey === itemKeyVal;

  function getRatingFromClientX(clientX: number): number {
    const track = sliderTrackRef.current;
    if (!track) return draftRating;
    const { left, width } = track.getBoundingClientRect();
    const pct = width > 0 ? (clientX - left) / width : 0.5;
    return clampRating(pct * 100);
  }

  function handleFacePointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || savingRating) return;
    pointerStartedOnSliderRef.current = true;
    const value = getRatingFromClientX(e.clientX);
    gestureDraftRef.current = value;
    setDraftRating(value);
    setHasUserMovedSlider(true);
    if (confirmTimeoutRef.current) window.clearTimeout(confirmTimeoutRef.current);
    e.preventDefault();

    const onMove = (e: PointerEvent) => {
      if (e.buttons === 0) {
        const reachedMax = gestureDraftRef.current >= 99;
        const reachedMin = gestureDraftRef.current <= 1;
        if (reachedMax || reachedMin) {
          onCommit(gestureDraftRef.current);
        }
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        pointerStartedOnSliderRef.current = false;
        return;
      }
      const v = getRatingFromClientX(e.clientX);
      gestureDraftRef.current = v;
      setDraftRating(v);
    };
    const onUp = (_e: PointerEvent) => {
      onCommit(gestureDraftRef.current);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      pointerStartedOnSliderRef.current = false;
    };
    const onCancel = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      pointerStartedOnSliderRef.current = false;
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  }

  return (
    <div className="mt-3 pt-3 border-t border-glass-border animate-slide-up">
      <div className="flex items-center justify-between gap-3 mb-1 min-h-[1.75rem]">
        <div className="min-w-[5.5rem] shrink-0" aria-hidden />
        <label
          htmlFor={ratingSliderId}
          className="text-sm font-semibold text-ink"
        >
          Rate it
        </label>
        <div className="min-w-[5.5rem] flex items-center justify-end shrink-0">
          {showSaved && (
            <p
              className="flex items-center gap-1.5 text-sm font-medium text-accent"
              role="status"
              aria-live="polite"
            >
              <Check className="h-4 w-4 shrink-0" aria-hidden />
              Saved
            </p>
          )}
        </div>
      </div>
      <div ref={sliderZoneRef} className="relative mt-0">
        <div
          className="relative h-[44px] pb-2 mb-5 cursor-grab active:cursor-grabbing touch-none"
          aria-hidden
          onPointerDown={handleFacePointerDown}
        >
          <span
            className="absolute transition-[left] duration-75 ease-out pointer-events-none"
            style={{
              fontSize: 40,
              left: `${faceLeft}%`,
              transform: "translateX(-50%)",
            }}
          >
            {getRatingEmoji(hasUserMovedSlider ? draftRating : null)}
          </span>
        </div>
        <div className="py-[6px]">
          <div
            ref={sliderTrackRef}
            className="relative flex h-[10px] items-center rounded-xl bg-[#252530]"
          >
            {/* Custom thumb aligned with face emoji (same thumbCenterPx) */}
            <span
              className="pointer-events-none absolute top-1/2 h-[22px] w-[22px] -translate-y-1/2 rounded-full border-2 border-white/50 bg-white/95 shadow-sm transition-[left] duration-75 ease-out"
              style={{
                left: `${thumbCenterPx(trackWidth, draftRating)}px`,
                transform: "translate(-50%, -50%)",
              }}
              aria-hidden
            />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={draftRating}
              onChange={(e) => {
                setHasUserMovedSlider(true);
                const v = clampRating(Number(e.target.value));
                setDraftRating(v);
                gestureDraftRef.current = v;
                if (confirmTimeoutRef.current)
                  window.clearTimeout(confirmTimeoutRef.current);
              }}
              onPointerDown={() => {
                pointerStartedOnSliderRef.current = true;
                gestureDraftRef.current = draftRating;
                const onInputUp = () => {
                  onCommit(gestureDraftRef.current);
                  document.removeEventListener("pointerup", onInputUp);
                  document.removeEventListener("pointercancel", onInputCancel);
                  inputDocUpRef.current = null;
                  inputDocCancelRef.current = null;
                  pointerStartedOnSliderRef.current = false;
                };
                const onInputCancel = () => {
                  document.removeEventListener("pointerup", onInputUp);
                  document.removeEventListener("pointercancel", onInputCancel);
                  inputDocUpRef.current = null;
                  inputDocCancelRef.current = null;
                  pointerStartedOnSliderRef.current = false;
                };
                inputDocUpRef.current = onInputUp;
                inputDocCancelRef.current = onInputCancel;
                document.addEventListener("pointerup", onInputUp);
                document.addEventListener("pointercancel", onInputCancel);
              }}
              onPointerUp={() => {
                if (!pointerStartedOnSliderRef.current) return;
                if (inputDocUpRef.current && inputDocCancelRef.current) {
                  document.removeEventListener("pointerup", inputDocUpRef.current);
                  document.removeEventListener("pointercancel", inputDocCancelRef.current);
                  inputDocUpRef.current = null;
                  inputDocCancelRef.current = null;
                }
                onCommit(draftRating);
                pointerStartedOnSliderRef.current = false;
              }}
              onPointerCancel={() => {
                pointerStartedOnSliderRef.current = false;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommit(draftRating);
              }}
              onTouchStart={() => {
                pointerStartedOnSliderRef.current = true;
              }}
              onTouchEnd={(e) => {
                if (!pointerStartedOnSliderRef.current) return;
                const touch = e.changedTouches?.[0];
                if (!touch) {
                  pointerStartedOnSliderRef.current = false;
                  return;
                }
                onCommit(draftRating);
                pointerStartedOnSliderRef.current = false;
              }}
              disabled={savingRating}
              className="rating-slider rating-slider-hide-thumb w-full"
              id={ratingSliderId}
              aria-label="Rate this title from 0 to 100"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type Props = {
  initialItems: RecommendationItem[];
  genreId?: number;
  genreLabel?: string;
  streamingServiceLabels?: string[];
  initialError?: string | null;
  emptyReason?: "no_streaming_services" | "no_genres_or_ratings";
};

export default function RecommendationsList({
  initialItems,
  genreId,
  genreLabel,
  streamingServiceLabels = [],
  initialError,
  emptyReason,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [visibleCount, setVisibleCount] = useState(
    Math.min(PAGE_SIZE, initialItems.length)
  );
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [retrying, setRetrying] = useState(false);
  const [ratingOpenFor, setRatingOpenFor] = useState<string | null>(null);
  const [draftRating, setDraftRating] = useState(50);
  const [hasUserMovedSlider, setHasUserMovedSlider] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const [savedForItemKey, setSavedForItemKey] = useState<string | null>(null);
  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const confirmTimeoutRef = useRef<number | null>(null);
  const pointerStartedOnSliderRef = useRef(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const ratingSliderId = useId();

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setError(null);
    try {
      const data = await getRecommendations(
        genreId ? { genreId } : undefined
      );
      setItems(data.items);
      setVisibleCount(Math.min(PAGE_SIZE, data.items.length));
    } catch {
      setError("Couldn't load recommendations.");
    } finally {
      setRetrying(false);
    }
  }, [genreId]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, items.length));
  }, [items.length]);

  useEffect(() => {
    if (!ratingOpenFor) return;
    setDraftRating(50);
    setHasUserMovedSlider(false);
  }, [ratingOpenFor]);

  useEffect(() => {
    const el = sliderTrackRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setTrackWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratingOpenFor]);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) window.clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  const handleRate = useCallback(
    async (tmdbId: number, type: string, rating: number, itemKeyVal: string) => {
      setSavingRating(true);
      try {
        const result = await rateRecommendation(tmdbId, type, clampRating(rating));
        if (result.error) {
          setError(result.error);
          return;
        }
        setSavedForItemKey(itemKeyVal);
        if (confirmTimeoutRef.current) window.clearTimeout(confirmTimeoutRef.current);
        const savedFeedbackMs = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 200 : 300;
        confirmTimeoutRef.current = window.setTimeout(() => {
          setItems((prev) =>
            prev.filter((i) => !(i.tmdb_id === tmdbId && i.type === type))
          );
          setRatingOpenFor(null);
          setSavedForItemKey(null);
          confirmTimeoutRef.current = null;
        }, savedFeedbackMs);
      } catch {
        setError("Couldn't save rating.");
      } finally {
        setSavingRating(false);
      }
    },
    []
  );

  const itemKey = (item: RecommendationItem) =>
    `${item.tmdb_id}:${item.type}`;

  const layout = (
    <>
      <Link
        href="/dashboard"
        className="group glass-pill-accent glass-hover absolute left-4 top-4 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-all duration-100 hover:scale-105 hover:text-accent active:scale-[0.98] [@media(prefers-reduced-motion:reduce)]:hover:scale-100"
        aria-label="Back to dashboard"
      >
        <ChevronLeft className="h-7 w-7 shrink-0 text-[var(--ink)] group-hover:text-white transition-colors duration-100" />
      </Link>
    </>
  );

  if (retrying) {
    return (
      <div className="relative flex min-h-screen flex-col px-4 pt-24 pb-12">
        {layout}
        <main className="mx-auto w-full max-w-5xl px-2 pb-12">
          <PageHeader genreId={genreId} genreLabel={genreLabel} streamingServiceLabels={streamingServiceLabels} />
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="relative flex min-h-screen flex-col px-4 pt-24 pb-12">
        {layout}
        <main className="mx-auto w-full max-w-5xl px-2 pb-12">
          <PageHeader genreId={genreId} genreLabel={genreLabel} streamingServiceLabels={streamingServiceLabels} />
          <GlassCard className="p-8 text-center">
            <p className="text-error mb-4">{error}</p>
            <Button variant="glass" onClick={handleRetry}>
              Try again
            </Button>
          </GlassCard>
        </main>
      </div>
    );
  }

  if (items.length === 0 && emptyReason === "no_streaming_services") {
    return (
      <div className="relative flex min-h-screen flex-col px-4 pt-24 pb-12">
        {layout}
        <main className="mx-auto w-full max-w-5xl px-2 pb-12">
          <PageHeader genreId={genreId} genreLabel={genreLabel} streamingServiceLabels={streamingServiceLabels} />
          <GlassCard className="p-8 text-center">
            <p className="text-ink mb-2">
              Add your streaming services to see recommendations.
            </p>
            <p className="text-muted text-sm mb-6">
              We only show titles you can watch on the services you have.
            </p>
            <Button variant="glass" asChild>
              <Link href="/get-started/streaming-services">
                Choose streaming services
              </Link>
            </Button>
          </GlassCard>
        </main>
      </div>
    );
  }

  if (items.length === 0 && emptyReason === "no_genres_or_ratings") {
    return (
      <div className="relative flex min-h-screen flex-col px-4 pt-24 pb-12">
        {layout}
        <main className="mx-auto w-full max-w-5xl px-2 pb-12">
          <PageHeader genreId={genreId} genreLabel={genreLabel} streamingServiceLabels={streamingServiceLabels} />
          <GlassCard className="p-8 text-center">
            <p className="text-ink mb-2">
              Rate some movies to get personalized recommendations.
            </p>
            <p className="text-muted text-sm mb-6">
              We use your ratings to learn your taste and only suggest titles that match your quality bar.
            </p>
            <Button variant="glass" asChild>
              <Link href="/get-started/rate-movies">Rate movies</Link>
            </Button>
          </GlassCard>
        </main>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col px-4 pt-24 pb-12">
      {layout}
      <main className="mx-auto w-full max-w-5xl px-2 pb-12">
        <PageHeader genreId={genreId} genreLabel={genreLabel} streamingServiceLabels={streamingServiceLabels} />

        {error && items.length > 0 && (
          <GlassCard className="p-4 text-center mb-6">
            <p className="text-error text-sm mb-2">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          </GlassCard>
        )}

        <div className="divide-y divide-glass-border">
          {visibleItems.map((item) => (
            <div
              key={itemKey(item)}
              className="px-2 pt-[17px] pb-4 transition-colors hover:bg-white/5 active:bg-white/8 animate-card-in"
            >
              <div className="flex gap-4">
                <div className="w-20 h-[120px] rounded-lg overflow-hidden shrink-0 bg-glass-bg">
                  {item.poster_url ? (
                    <Image
                      src={item.poster_url}
                      alt={item.title ?? ""}
                      width={80}
                      height={120}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-subtle text-xs">
                      No poster
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-ink break-words">
                    {item.title ?? "Untitled"}
                  </h3>
                  <p className="text-sm text-muted">
                    {item.year_display ?? ""}
                  </p>
                  <p className="text-xs text-subtle mt-1.5">
                    {genreLabels(
                      getItemAppGenreIds(item.genre_ids)
                    ).join(" · ") || "—"}
                  </p>
                  <p className="text-xs text-subtle mt-1">
                    {serviceLabels(item.provider_ids).join(" · ") || "—"}
                  </p>
                </div>

                <div className="flex flex-col items-end justify-between shrink-0">
                  <div className="text-right">
                    <p className="text-[0.6875rem] text-subtle uppercase tracking-wide">
                      Score
                    </p>
                    <p className="text-xl font-semibold text-ink">
                      {item.score ?? "—"}
                    </p>
                  </div>
                  <Button
                    variant="glass"
                    size="sm"
                    className="glass-watch-next-accent glass-hover text-text-on-accent transition-all duration-100 hover:scale-105 active:scale-[0.98] [@media(prefers-reduced-motion:reduce)]:hover:scale-100 [@media(prefers-reduced-motion:reduce)]:active:scale-100"
                    onClick={() =>
                      setRatingOpenFor(
                        ratingOpenFor === itemKey(item)
                          ? null
                          : itemKey(item)
                      )
                    }
                    disabled={savingRating}
                  >
                    Rate
                  </Button>
                </div>
              </div>

              {ratingOpenFor === itemKey(item) && (
                <RecommendationRatingSlider
                  draftRating={draftRating}
                  setDraftRating={setDraftRating}
                  hasUserMovedSlider={hasUserMovedSlider}
                  setHasUserMovedSlider={setHasUserMovedSlider}
                  savingRating={savingRating}
                  savedForItemKey={savedForItemKey}
                  itemKeyVal={itemKey(item)}
                  trackWidth={trackWidth}
                  sliderTrackRef={sliderTrackRef}
                  ratingSliderId={ratingSliderId}
                  pointerStartedOnSliderRef={pointerStartedOnSliderRef}
                  confirmTimeoutRef={confirmTimeoutRef}
                  onCommit={(rating) =>
                    handleRate(item.tmdb_id, item.type, rating, itemKey(item))
                  }
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          {hasMore && (
            <Button variant="glass" onClick={handleLoadMore}>
              Load more
            </Button>
          )}
          {!hasMore && items.length > 0 && (
            <p className="text-muted text-sm">That&apos;s everything!</p>
          )}
        </div>
      </main>
    </div>
  );
}

function formatServicesSubtitle(labels: string[]): string {
  if (labels.length === 0) return "Your services match your taste.";
  if (labels.length === 1) return `${labels[0]} matches your taste.`;
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1).join(", ");
  return `${rest} and ${last} match your taste.`;
}

function PageHeader({
  genreId,
  genreLabel,
  streamingServiceLabels = [],
}: {
  genreId?: number;
  genreLabel?: string;
  streamingServiceLabels?: string[];
}) {
  const changeServicesHref =
    "/get-started/streaming-services?edit=1&returnTo=" +
    encodeURIComponent(genreId != null ? `/recommendations?genre=${genreId}` : "/recommendations");
  return (
    <div className="mb-8">
      <h1 className="text-[1.75rem] font-semibold tracking-tight text-ink mb-0">
        {genreLabel ? `Watch Next ${genreLabel}` : "Watch Next"}
      </h1>
      <p className="-mt-1 text-muted">
        {formatServicesSubtitle(streamingServiceLabels)}
        {" "}
        <Link
          href={changeServicesHref}
          className="text-text-on-accent underline underline-offset-2 hover:no-underline"
        >
          Change services
        </Link>
      </p>
    </div>
  );
}
