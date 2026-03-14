# Changelog

Track significant changes to the project. Update this file when making notable changes.

---

## [Unreleased]

### Changed
- **Rating slider and face emoji alignment** — On the rate-movies page (including Rate More) and the recommendations page, the rating face emoji and the slider thumb are now perfectly centered together. Native range thumb is hidden and a custom thumb is positioned with the same formula as the emoji (`thumbCenterPx`), so both stay in sync. Uses `.rating-slider-hide-thumb` in `app/globals.css`.
- **Recommendation bar: inverted user-rating mapping** — Per-genre quality bar is derived from the user's average rating (0–100) via an inverted mapping: `bar = clamp(round(100 - avgUserRating), 30, 80)`. High ratings lower the bar (more matches); low ratings raise it (fewer matches). Drama is not used for bars (no bar computed); in the filter, genres with no bar are skipped (item passes). See `lib/recommendation-engine.ts` and `briefs/recommendation-logic.md`.
- **Dashboard genre match counts** — “X matches” per genre now counts all eligible recommendations for that genre (computed from the full filtered set), not just the top-50 ranked recommendations.

### Added
- **Dashboard genre zero state** — When a genre has no ratings, the "By Genre" row shows concise copy ("Rate [Genre] to see where you land.") and a CTA "Rate [Genre]" linking to `/get-started/rate-movies?genre={id}` so users can rate titles for that genre first. Genre-filtered rate-movies shows only titles in that genre from the curated list.
- **Block recommendations until rated** — Users with no ratings (or no genres) are redirected from `/recommendations` to the dashboard instead of seeing an in-page zero state.
- **Dashboard taste-scale visualization** — Replaced the stats glass card (ratings count, vs critics, vs public numbers) with a single gradient bar: amber/violet scale with muted center, two icon markers (critics / audience), and one-word term labels (Savage, Brutal, Snobby, … Aligned, Chill, … Hopeless). Term derived from `lib/taste-scale.ts`; key explains icons. Quiet ratings count under taste title. Empty state: muted bar + "Rate movies" CTA.
- **Recommendations UI** — Dashboard "For you" card with primary CTA "See My Recommendations" and per-genre tertiary "See recommendations" links.
- **Recommendations page** (`/recommendations`) — Single-column list with poster, title, year, genre labels, combined score, streaming services. Inline 5-level rating (same as onboarding); rated items disappear from list. Client-side "Load more" pagination (20 at a time); "That's everything!" end state. Skeleton loading rows and error state with retry. Optional `?genre=<id>` filter.
- Rating server action (`app/(app)/recommendations/actions.ts`) for upsert to `user_ratings` from the recommendations page.
- Personalized recommendation engine (`lib/recommendation-engine.ts`) with per-genre quality bars derived from user taste vs. critic/public scores, streaming service filtering, Drama exception, and combined-score ranking (top 50).
- Server action `getRecommendations` (`app/(app)/dashboard/recommendations-actions.ts`) wiring user data through the engine; extended with genre filter, pagination, and combined score per item.
- 28 unit tests for bar computation, filtering edge cases, and ranking (`lib/recommendation-engine.test.ts`).
- Vitest test framework and config (`vitest.config.ts`).

### Changed
- **Rate-movies UX** — Catalog mode: ghost back button on first item (same layout as when back is shown) to prevent title/header shift. Rating card: visible label "How did you feel about it?", slider aria-label "Rate this title from 0 to 100". Brief "Saved" feedback (check + text) for ~300ms on commit before advancing; respects prefers-reduced-motion. Commit only when pointer/touch is released over the slider (avoids accidental save on scroll). Movie title: text-3xl, line-clamp-2, optional title attribute for long names.
- **Rate-movies genre filter** — `getCuratedListForUser(genreId?)` accepts an optional `genreId`; when provided (e.g. from `?genre=` on the rate-movies page), the curated list is filtered to items that include that app genre. Dashboard zero-state CTA uses this to send users to rate titles for a specific genre.
- **Public score (taste-diffs, recommendation engine)** — Public score now uses Rotten Tomatoes when present, else IMDb, else null (no longer averages RT and IMDb when both exist).
- **Gemini taste prompt and parsing** — Stricter prompt (CRITICAL response-format block) so the model returns only one line of JSON; parser now extracts the first `{...}` from the response when the full string is not valid JSON, so preamble/suffix no longer cause parse failure and default/N/A.
- **Taste profile (Gemini) moved to dashboard** — Generation no longer runs on the streaming services page; it runs on first dashboard load when the profile has no taste title. Streaming step is faster; subsequent dashboard loads only read existing data and do not call Gemini.
- Dashboard stats card now shows taste-scale bar (no raw diff numbers on card); ratings count moved below taste title with subtle styling.
- Dashboard genre rows now include `genreId` for linking to genre-filtered recommendations.
- Middleware recognizes `/recommendations` as an app route (auth + onboarding enforcement).
- Exported `publicScore` from `lib/taste-diffs.ts` for reuse by the recommendation engine.
- Updated `briefs/recommendation-logic.md` with finalized 12-point decision table.
