"use client";

import {
  getCatalogPage,
  getCuratedListForUser,
  getItemDetails,
  getSavedRating,
  saveRating,
  skipItem,
} from "./actions";
import type { CatalogListItem, CuratedItem } from "./actions";
import { detailsFromCatalogItem, detailsFromCuratedItem, genreIdsToLabels } from "./utils";
import type { RatingItemDetails } from "@/lib/tmdb";
import { getRatingEmoji } from "@/components/rating-face";
import { TypewriterText } from "@/components/typewriter-text";
import { Check, ChevronLeft, SkipForward, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type Phase = "intro" | "interactive";

function clampRating(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function GetStartedRateMoviesPage() {
  const searchParams = useSearchParams();
  const genreParam = searchParams.get("genre");
  const genreId =
    genreParam != null && !isNaN(Number(genreParam))
      ? Number(genreParam)
      : undefined;
  const isCatalogMode = searchParams.get("mode") === "catalog";

  const [phase, setPhase] = useState<Phase>("intro");
  const [list, setList] = useState<(CuratedItem | CatalogListItem)[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogExhausted, setCatalogExhausted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [details, setDetails] = useState<RatingItemDetails | null>(null);
  const [savedRating, setSavedRating] = useState<number | null>(null);
  const [draftRating, setDraftRating] = useState<number>(50);
  const [hasUserMovedSlider, setHasUserMovedSlider] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const router = useRouter();
  const confirmTimeoutRef = useRef<number | null>(null);
  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const sliderInputRef = useRef<HTMLInputElement>(null);
  const sliderZoneRef = useRef<HTMLDivElement>(null);
  const pointerStartedOnSliderRef = useRef(false);
  const gestureDraftRef = useRef(50);
  const inputDocUpRef = useRef<(() => void) | null>(null);
  const inputDocCancelRef = useRef<(() => void) | null>(null);
  const ratingSliderId = useId();
  const [trackWidth, setTrackWidth] = useState(0);

  function getRatingFromClientX(clientX: number): number {
    const track = sliderTrackRef.current;
    if (!track) return draftRating;
    const { left, width } = track.getBoundingClientRect();
    const pct = width > 0 ? (clientX - left) / width : 0.5;
    return clampRating(pct * 100);
  }

  const currentItem = list[currentIndex];

  /* Thumb center in px (same formula for face and custom thumb so they stay aligned) */
  const thumbCenterPx =
    trackWidth > 22
      ? 11 + ((trackWidth - 22) * draftRating) / 100
      : (trackWidth * draftRating) / 100;
  const thumbCenterPct =
    trackWidth > 22
      ? (thumbCenterPx / trackWidth) * 100
      : draftRating;
  const halfFacePct = trackWidth > 0 ? (25 / trackWidth) * 100 : 8;
  const faceLeftPercent = Math.max(
    halfFacePct,
    Math.min(100 - halfFacePct, thumbCenterPct),
  );

  useEffect(() => {
    const el = sliderTrackRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setTrackWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadList = useCallback(async () => {
    if (isCatalogMode) {
      setCatalogExhausted(false);
      const items = await getCatalogPage(0, 30);
      setList(items);
      if (items.length === 0) setLoading(false);
      else setCurrentIndex(0);
      return items;
    }
    const items = await getCuratedListForUser(genreId);
    setList(items);
    if (items.length === 0) {
      setLoading(false);
      return;
    }
    setCurrentIndex(0);
    return items;
  }, [genreId, isCatalogMode]);

  const loadCurrentItem = useCallback(async () => {
    if (!currentItem) return;
    if (isCatalogMode) {
      setDetails(detailsFromCatalogItem(currentItem as CatalogListItem));
      setSavedRating(null);
      setDraftRating(50);
      setHasUserMovedSlider(false);
      setLoading(false);
      getSavedRating(currentItem.tmdb_id, currentItem.type).then((r) => {
        setSavedRating(r);
        setDraftRating(r ?? 50);
        setHasUserMovedSlider(r != null);
      });
      return;
    }
    const cached = detailsFromCuratedItem(currentItem as CuratedItem);
    if (cached) {
      setDetails(cached);
      setSavedRating(null);
      setDraftRating(50);
      setHasUserMovedSlider(false);
      setLoading(false);
      getSavedRating(currentItem.tmdb_id, currentItem.type).then((r) => {
        setSavedRating(r);
        setDraftRating(r ?? 50);
        setHasUserMovedSlider(r != null);
      });
      return;
    }
    setLoading(true);
    setSaveError(null);
    try {
      const r = await getSavedRating(currentItem.tmdb_id, currentItem.type);
      setSavedRating(r);
      setDraftRating(r ?? 50);
      setHasUserMovedSlider(r != null);
      const d = await getItemDetails(currentItem.tmdb_id, currentItem.type);
      setDetails(d);
    } finally {
      setLoading(false);
    }
  }, [currentItem, isCatalogMode]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (list.length && currentItem) {
      loadCurrentItem();
    }
  }, [
    list.length,
    currentIndex,
    currentItem?.tmdb_id,
    currentItem?.type,
    loadCurrentItem,
  ]);

  function goNext() {
    if (currentIndex + 1 >= list.length) {
      if (isCatalogMode) {
        if (catalogExhausted) return;
        setLoadingMore(true);
        getCatalogPage(list.length, 50)
          .then((more) => {
            if (more.length > 0) {
              setList((prev) => [...prev, ...more]);
              setDetails(null);
              setCurrentIndex(list.length);
            } else {
              setCatalogExhausted(true);
            }
          })
          .finally(() => setLoadingMore(false));
        return;
      }
      router.push("/get-started/streaming-services");
      return;
    }
    setDetails(null);
    setCurrentIndex((i) => i + 1);
    if (isCatalogMode && currentIndex + 1 >= list.length - 3) {
      getCatalogPage(list.length, 50).then((more) => {
        if (more.length > 0) setList((prev) => [...prev, ...more]);
      });
    }
  }

  async function commitRating(nextRating: number) {
    if (!currentItem || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const rating = clampRating(nextRating);
      await saveRating(currentItem.tmdb_id, currentItem.type, rating);
      setSavedRating(rating);
      setDraftRating(rating);
      setShowSavedFeedback(true);

      if (confirmTimeoutRef.current) window.clearTimeout(confirmTimeoutRef.current);
      const savedFeedbackMs =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 200
          : 400;
      confirmTimeoutRef.current = window.setTimeout(() => {
        setShowSavedFeedback(false);
        goNext();
      }, savedFeedbackMs);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Couldn't save. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleFacePointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || saving) return;
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
        const shouldCommit = reachedMax || reachedMin;

        if (shouldCommit) {
          commitRating(gestureDraftRef.current);
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
      commitRating(gestureDraftRef.current);
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

  async function handleSkip() {
    if (!currentItem || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await skipItem(currentItem.tmdb_id, currentItem.type);
      if (currentIndex + 1 >= list.length) {
        if (isCatalogMode) {
          if (!catalogExhausted) {
            setLoadingMore(true);
            getCatalogPage(list.length, 50)
              .then((more) => {
                if (more.length > 0) {
                  setList((prev) => [...prev, ...more]);
                  setDetails(null);
                  setCurrentIndex(list.length);
                } else {
                  setCatalogExhausted(true);
                }
              })
              .finally(() => setLoadingMore(false));
          }
        } else {
          router.push("/get-started/streaming-services");
        }
        return;
      }
      setDetails(null);
      setCurrentIndex((i) => i + 1);
      if (isCatalogMode && currentIndex + 1 >= list.length - 3) {
        getCatalogPage(list.length, 50).then((more) => {
          if (more.length > 0) setList((prev) => [...prev, ...more]);
        });
      }
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Couldn't skip. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (saving) return;
    if (currentIndex <= 0) {
      if (!isCatalogMode) {
        router.push("/get-started/genre");
      }
      return;
    }
    if (confirmTimeoutRef.current) window.clearTimeout(confirmTimeoutRef.current);
    setDetails(null);
    setCurrentIndex((i) => Math.max(0, i - 1));
  }

  function handleCloseCatalog() {
    if (saving) return;
    router.push("/dashboard?refreshTaste=1");
  }

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) window.clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  /* Intro: typewriter message (skip in catalog mode) */
  if (phase === "intro" && !isCatalogMode) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="w-full max-w-lg">
          <TypewriterText
            text="Now rate a handful of movies you've already seen to see what your taste is per genre."
            onComplete={() => setTimeout(() => setPhase("interactive"), 2500)}
            className="text-lg leading-relaxed text-ink"
          />
        </div>
      </div>
    );
  }

  /* Empty list: no genres selected yet, or catalog exhausted */
  if (list.length === 0 && !details) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        {loading ? (
          <div
            className="h-8 w-48 rounded-lg bg-glass-bg animate-skeleton"
            aria-hidden
          />
        ) : isCatalogMode ? (
          <>
            <p className="text-center text-muted">
              No more titles to rate right now.
            </p>
            <Link
              href="/dashboard"
              className="min-h-[44px] inline-flex items-center text-sm font-medium text-accent underline-offset-2 transition-colors hover:text-accent-hover hover:underline"
            >
              Back to dashboard
            </Link>
          </>
        ) : (
          <>
            <p className="text-center text-muted">
              Select your preferred genres first to start rating.
            </p>
            <Link
              href="/get-started/genre"
              className="min-h-[44px] inline-flex items-center text-sm font-medium text-accent underline-offset-2 transition-colors hover:text-accent-hover hover:underline"
            >
              Back to genres
            </Link>
          </>
        )}
      </div>
    );
  }

  /* Loading skeleton: initial list load */
  if (loading && !details) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="relative h-screen w-full flex-shrink-0 bg-surface animate-skeleton" />
        <div className="flex flex-wrap justify-center gap-2 px-4 py-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-11 w-20 rounded-full bg-glass-bg animate-skeleton"
              aria-hidden
            />
          ))}
        </div>
      </div>
    );
  }

  /* Title still loading: we have a current item but details not set yet */
  if (!details) {
    if (list.length > 0 && currentItem) {
      return (
        <div className="flex min-h-screen flex-col">
          <div className="relative h-screen w-full flex-shrink-0 bg-surface animate-skeleton" />
          <div className="flex flex-wrap justify-center gap-2 px-4 py-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-11 w-20 rounded-full bg-glass-bg animate-skeleton"
                aria-hidden
              />
            ))}
          </div>
        </div>
      );
    }
    return null;
  }

  const heroUrl = details.posterUrl ?? details.backdropUrl;

  return (
    <div
      key={currentIndex}
      className="relative flex min-h-[100svh] flex-col overflow-hidden animate-fade-in"
    >
      {/* Hero: fills space above the rating card; poster extends 31px behind card */}
      <div className="relative min-h-0 flex-1 bg-surface pb-[31px] -mb-[31px]">
        {heroUrl ? (
          <Image
            src={heroUrl}
            alt=""
            fill
            className="object-cover object-center"
            sizes="100vw"
            unoptimized
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-subtle">
            No image
          </div>
        )}
        {/* General readability overlay */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/10 to-black/80"
          aria-hidden
        />
        {/* Top gradient: black 100% opaque at top, fades out over 100px */}
        <div
          className="absolute inset-x-0 top-0 z-[1] h-[100px] bg-gradient-to-b from-black to-transparent"
          aria-hidden
        />
      </div>

      {/* Top bar (absolute over poster) */}
      <div className="absolute left-0 right-0 top-0 z-10 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          {isCatalogMode ? (
            currentIndex > 0 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={saving}
                className="group glass-pill-accent glass-hover inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-all duration-100 hover:scale-105 hover:text-accent active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none [@media(prefers-reduced-motion:reduce)]:hover:scale-100 [@media(prefers-reduced-motion:reduce)]:active:scale-100"
                aria-label="Back"
              >
                <ChevronLeft className="h-7 w-7 shrink-0 text-[var(--ink)] group-hover:text-white transition-colors duration-100" />
              </button>
            ) : (
              <div
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full opacity-50"
                aria-hidden
              >
                <ChevronLeft className="h-7 w-7 shrink-0 text-[var(--ink)]" />
              </div>
            )
          ) : (
            <button
              type="button"
              onClick={handleBack}
              disabled={saving}
              className="group glass-pill-accent glass-hover inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-all duration-100 hover:scale-105 hover:text-accent active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none [@media(prefers-reduced-motion:reduce)]:hover:scale-100 [@media(prefers-reduced-motion:reduce)]:active:scale-100"
              aria-label="Back"
            >
              <ChevronLeft className="h-7 w-7 shrink-0 text-[var(--ink)] group-hover:text-white transition-colors duration-100" />
            </button>
          )}
          {isCatalogMode ? (
            <button
              type="button"
              onClick={handleCloseCatalog}
              disabled={saving}
              className="group glass-pill-accent glass-hover inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-all duration-100 hover:scale-105 hover:text-accent active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none [@media(prefers-reduced-motion:reduce)]:hover:scale-100 [@media(prefers-reduced-motion:reduce)]:active:scale-100"
              aria-label="Close"
            >
              <X className="h-7 w-7 shrink-0 text-[var(--ink)] group-hover:text-white transition-colors duration-100" />
            </button>
          ) : (
            <div className="text-xs font-medium text-white/80">
              {currentIndex + 1} / {list.length}
            </div>
          )}
        </div>

        <div className="mt-4">
          <h1
            className="text-3xl font-semibold tracking-tight text-white drop-shadow-sm line-clamp-2"
            title={details.title}
          >
            {details.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0 text-sm text-white/90">
            {details.yearDisplay && <span>{details.yearDisplay}</span>}
            {details.parentalRating && <span>{details.parentalRating}</span>}
            {details.genreIds?.length > 0 && (
              <span>{genreIdsToLabels(details.genreIds).join(", ")}</span>
            )}
          </div>
        </div>
      </div>

      {/* Your rating card — gradient above poster (solid base), same look as dashboard card */}
      <div className="relative z-10 flex-shrink-0 overflow-hidden rounded-t-2xl px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] glass-card-over-poster">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center justify-between gap-3 mt-5 mb-1 min-h-[1.75rem]">
            <div className="min-w-[5.5rem] shrink-0" aria-hidden />
            <label
              htmlFor={ratingSliderId}
              className="text-xl font-semibold text-ink text-center"
            >
              Rate It
            </label>
            <div className="min-w-[5.5rem] flex items-center justify-end shrink-0">
              {showSavedFeedback && (
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
          {/* Vertical padding so 22px thumb isn’t clipped; charcoal strip stays 10px tall */}
          <div ref={sliderZoneRef} className="relative mt-0">
            <div
              className="relative h-[52px] pb-2 mb-7 cursor-grab active:cursor-grabbing touch-none"
              aria-hidden
              onPointerDown={handleFacePointerDown}
            >
              <span
                className="absolute transition-[left] duration-75 ease-out pointer-events-none"
                style={{
                  fontSize: 50,
                  left: `${faceLeftPercent}%`,
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
                  style={{ left: `${thumbCenterPx}px`, transform: "translate(-50%, -50%)" }}
                  aria-hidden
                />
                <input
                  ref={sliderInputRef}
                  id={ratingSliderId}
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
                    if (confirmTimeoutRef.current) window.clearTimeout(confirmTimeoutRef.current);
                  }}
                  onPointerDown={() => {
                    pointerStartedOnSliderRef.current = true;
                    gestureDraftRef.current = draftRating;
                    const onInputUp = () => {
                      commitRating(gestureDraftRef.current);
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
                    commitRating(draftRating);
                    pointerStartedOnSliderRef.current = false;
                  }}
                  onPointerCancel={() => {
                    pointerStartedOnSliderRef.current = false;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRating(draftRating);
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
                    commitRating(draftRating);
                    pointerStartedOnSliderRef.current = false;
                  }}
                  disabled={saving}
                  className="rating-slider rating-slider-hide-thumb w-full"
                  aria-label="Rate this title from 0 to 100"
                />
              </div>
            </div>
          </div>

          {saveError && (
            <p className="mt-3 text-center text-sm text-error" role="alert">
              {saveError}{" "}
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-accent rounded"
              >
                Dismiss
              </button>
            </p>
          )}

          {isCatalogMode && catalogExhausted && (
            <p className="mt-3 text-center text-sm text-muted" role="status">
              No more titles to rate right now.
            </p>
          )}

          {isCatalogMode && loadingMore && (
            <p className="mt-2 text-center text-sm text-muted" role="status">
              Loading more titles…
            </p>
          )}

          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleSkip}
              disabled={saving}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-full px-5 text-sm font-semibold text-muted transition-colors hover:text-ink hover:bg-glass-bg disabled:opacity-50"
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
