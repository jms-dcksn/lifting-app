# Program Grid Navigation Design

## Goal

Make saved programs fast to scan and navigate by replacing expandable cards with a responsive tile grid and moving full program content to a dedicated read-only detail screen.

## Current Problem

`/program` currently loads every saved program with all nested days and slots, stacks the programs vertically, and expands one full program inline. Expansion creates a very tall card, increases scroll friction, and mixes browsing, viewing, and actions on one screen.

## Chosen Approach

Use separate summary and detail data paths:

- `/program` loads lightweight program summaries for the tile grid.
- `/program/[id]` loads one complete program for read-only display.
- `/program/[id]?mode=edit` loads that program in the existing builder.
- `/program/new` loads an empty builder.

This keeps the index lightweight and gives each screen one responsibility. A modal or drawer is out of scope because it would retain the overloaded single-screen interaction. Reusing fully assembled program data on the index is also rejected because it would preserve unnecessary nested loading.

## Program Index

The index uses a one-column grid on phones and two columns at the `sm` breakpoint and wider. The active program is always first. Remaining programs are ordered newest first.

Each tile is one semantic link and shows only:

- program name;
- active status;
- training days per week;
- duration in weeks;
- total exercise count across all days;
- program style (`classic` or `fluid`);
- the first tag as the primary tag.

Additional tags do not appear on the tile, but all tags remain available through the existing tag filter. Tiles have visible hover and keyboard-focus states. They contain no buttons or secondary actions.

The built-in templates stay below the saved-program grid as a compact, visually separate list. Templates are creation shortcuts and must not look like owned programs.

## Program Detail

The detail screen is read-only by default. Its header contains:

- a back link to `/program`;
- the program name;
- active status;
- days per week, duration, exercise count, and style;
- the description and full tag list.

Training days render directly, without accordions or horizontal scrolling. They use one column on phones and two columns at the `sm` breakpoint and wider. Each exercise displays its name, movement pattern and equipment, target sets, target rep range, and target RIR.

Edit, Make active, and Clone appear together after the program content. Make active is not shown when the program is already active.

## Navigation and Actions

The route contract is:

- index: `/program`;
- create: `/program/new`;
- detail: `/program/[id]`;
- edit: `/program/[id]?mode=edit`.

All route construction is centralized in a small pure helper module. Tiles, detail actions, builder save/cancel behavior, and clone navigation use these helpers.

Behavior is explicit:

- selecting a tile navigates to its detail screen;
- Edit opens the same program in edit mode;
- saving an existing program returns to its detail screen;
- canceling an existing edit discards client changes and returns to its detail screen;
- creating a program preserves the current behavior and returns to the index after save;
- Make active updates the detail state and causes the program to appear first on the index;
- Clone creates an inactive copy and opens the copy in edit mode;
- creating from a built-in template retains its current behavior and returns to the index.

Legacy query-param URLs are internal and need no compatibility redirect.

## Data Design

Add a `ProgramSummary` type containing the tile fields and a `listProgramSummaries()` loader. It uses three batched queries:

1. load the user's program metadata ordered by active status and creation time;
2. load all days belonging to those program IDs;
3. load slot IDs belonging to those day IDs.

The loader aggregates day and exercise counts in memory. It must not call the existing per-program `assemble()` function. Empty program and day ID lists short-circuit the dependent queries.

`getProgram()` remains the full-data loader for detail and edit screens. The detail route also loads the merged exercise catalog so custom exercise names, patterns, and equipment resolve consistently.

No database migration is required.

## Component Boundaries

- `ProgramGallery` owns tag-filter state and renders the ordered grid plus templates.
- `ProgramTile` renders one summary as a semantic link and has no mutation logic.
- `ProgramDetail` renders one complete program and owns the client-side pending states for Make active and Clone.
- `ProgramBuilder` retains create/edit form behavior and receives route-helper-generated save and cancel destinations.
- The program route helper owns index, create, detail, and edit URL generation.

The existing expandable `ProgramCard` is removed after its display and action behavior has moved to `ProgramTile` and `ProgramDetail`.

## Empty and Error States

The existing first-run screen remains when the user has no programs. A tag with no matches continues to show a clear empty-filter message.

An unknown or unauthorized program ID calls `notFound()`; it must never open an empty builder. Authentication continues to redirect to `/login`. Make active and Clone keep visible pending states and disable duplicate submissions. Server action failures flow through the route's existing error boundary behavior.

## Verification

Automated coverage includes:

- summary aggregation for zero, one, and multiple programs;
- active-first and newest-first ordering;
- day and exercise counts;
- route helper output for index, create, detail, and edit;
- existing tag normalization and filtering behavior.

Repository verification runs the focused tests, full unit test suite, TypeScript check, and production build.

Browser verification covers:

- one-column mobile and two-column wider index layouts;
- tile keyboard focus and full-tile navigation;
- active-first ordering and tag filtering;
- detail day-grid layout at mobile and wider widths;
- detail to edit, save to detail, and cancel to detail;
- Make active updating detail and index order;
- Clone opening the new copy in edit mode;
- new-program and template creation flows;
- missing program IDs returning the not-found screen.

## Out of Scope

- deleting programs;
- changing the database schema;
- adding search, sorting controls, or pagination;
- changing template content or creation semantics;
- redesigning the program builder;
- compatibility redirects for the old query-param detail URLs.
