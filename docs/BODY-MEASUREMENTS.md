# Body measurements

The Body page (`/analytics/body`) keeps the weight card first and plots tape sites
under it. One row in `body_measurement_log` is one site on one Chicago `dateKey`.
A missing site is a missing row, not a null column.

`SITES` in `src/lib/body-measurements.ts` is the site list for validation, chips,
and the inches chart. The five sites are waist, neck, arm, thigh, and chest.
V1 stores one arm number and one thigh number.

## Writes

`writeMeasurements` in `src/app/(app)/measurements/actions.ts` parses the payload
with `parseMeasurementWrite` before it touches the database. Inches must be greater
than 0 and at most 80. The date must be today or earlier. Save writes the sites that
have values. Empty fields do not delete an existing row. The same owner, date, and
site replaces through `upsert` on `(user_id, logged_on, site)`.

An empty save returns "Enter at least one site." and writes nothing. The action
revalidates `/analytics/body` only. It does not refresh session or workout routes.
Tape inches never enter `effectiveLoad`, `getCurrentBodyweight`, or the Coach API.

## Reads and chart

The Body page loads owner rows through today and maps them with `parseMeasurementRow`.
`seriesBySite` groups the list. Chips default on for every site that has points.
Toggling a chip shows or hides that series. Range buttons reuse `weightRangeStart`
from [weight trends](WEIGHT-TRENDS.md). Measurements have no goal line and no
period overlay.

The Log control opens a `Sheet`. The date defaults to today. The five inch fields
are optional. Date entry is the date field on that sheet.

## Ownership

RLS matches `bodyweight_log`. Authenticated owners select, insert, update, and
delete their own rows. Cross-owner reads and writes fail. `supabase/tests/body_measurement_rls.sql`
covers owner isolation, a denied cross-user insert, invalid inches, a future date,
and a duplicate site plus date.
