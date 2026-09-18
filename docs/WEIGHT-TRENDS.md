# Bodyweight trends — epic #27, slice #29

The Board More sheet opens with measured weights (dots), trailing seven-calendar-day
means (line), and the saved goal (dashed reference). Default is 90 days; 30 days,
six calendar months (month-end clamped), and all history are available. The chart
uses numeric date positions, preserving real gaps and elapsed time. All values
are pounds; weigh-in dates remain date-only, with today in America/Chicago.

`weight-trends.ts` reuses `bodyweightTrend` for every rolling mean. The first
visible value includes observations from six preceding days. No observations
means null, never zero or a fabricated raw reading. Hollow trend markers denote
windows with fewer than three readings. Tooltips and the expandable data table
include window dates, units, means, and observation counts. Empty stretches are
represented by null boundary points, avoiding huge allocations for ancient dates.

Summary metrics always use today and the prior non-overlapping seven days,
independent of the chart filter. Stale history is labeled and never substituted
for today's average. Settings and Coach continue using the same canonical helper.
Optional weekly bars cover 12 Monday–Sunday calendar weeks matching the ISO-week
boundary; the current week is clipped to today and labeled partial.

## Goal contract

The existing schema stores `goal_weight`, but no frozen goal-start observation.
This release intentionally uses #29's distance-only fallback: absolute distance
and above/below/at goal. It does not infer gain/loss intent, invent a percentage,
or declare a crossed goal completed without a starting point. Goal changes apply
immediately; filters never redefine a baseline. A future percentage indicator
must atomically freeze a baseline when the goal is created/changed. No target-date
forecasting or muscle/fat composition claims are made.

## Reads and writes

`loadWeightHistory` reads all owner-scoped observations through today with keyset
pagination. It keeps fetching until an empty page, including if the server cap
is smaller than the requested 500 rows. Errors surface rather than displaying a
partial series. No elevated client, migration, or new environment variable.

Tapping a raw dot or its accessible table edit control opens the shared weight
calendar at that date. Calendar mutations retain the existing authenticated
atomic-write contract; revalidation and router refresh rebuild chart windows,
summary cards, and weekly means after corrections/deletions.

## Verification

- 245 tests pass, including canonical-window agreement, hidden lookback,
  gaps, sparse/stale/invalid data, leap/month boundaries, backdated corrections,
  gain/loss/crossed/equal/absent goals, and pagination/owner scope/query failures.
- Typecheck, lint, and production build pass (placeholder public Supabase config
  used locally; Vercel uses its configured project values).
- Browser verification of the local fixture was blocked by the cloud browser's
  localhost access restriction. The fixture was removed. Authenticated mobile
  preview remains a manual review item; no test observations were written.

## Vercel preview checklist

1. Open Board → More on a phone; check chart, goal line, and range buttons fit.
2. Switch ranges: historical coverage changes, today's summary stays constant.
3. Tap a raw dot, correct its weight, and confirm recalculated trend/weekly bars.
4. Expand the data table and use its edit button with a keyboard.
5. Expand weekly averages; check dates, counts, partial-week label, and gaps.
6. Change/remove the goal in You and revisit Board → More; check distance/Set goal.


The monthly review reuses this card with an explicit calendar window. Chart points are
clipped to that window while rolling averages retain the prior six days. Summary averages
are anchored to the selected end date and labeled accordingly; the displayed goal remains
the current Settings goal. Range controls and 12-week bars stay on the Board More weight card.
