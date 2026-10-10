# Exercise artwork generation specification

Approved direction: **B / Bold Charcoal**, selected by James on 2026-10-10.
This document is the reusable art brief for future generation and replacement work.
It supersedes the cream-paper styling and center zoom in the historical
[exercise visuals spec](superpowers/specs/2026-09-28-exercise-visuals-design.md).
The [UI conventions](UI.md) and source remain authoritative for rendering and identity.

## Visual language

- Premium vintage sports illustration: confident ink contours, finely hatched ivory
  anatomy, sculpted light and shadow, and a restrained charcoal paper texture.
- Near-black charcoal background, approximately `#202225`. Keep it quiet, without a gym
  scene, graphic decorations, a bright halo, or colored lighting.
- Warm ivory highlights; preserve dark midtones so the athlete does not look like a
  white cutout. Dark steel equipment has readable ivory edge highlights.
- Muted oxblood/burgundy, approximately `#973f48`, on fitted training clothing,
  plate faces, dumbbell ends, or upholstery. It is an illustration accent, not a UI status.
- Athletic adults with believable anatomy and varied representation. Use fitted training
  clothes and shoes, natural hands, and coherent equipment. Avoid exaggerated proportions.
- Soft, compact grounding shadow and subtle floor texture. Clear silhouettes matter more
  than fine detail at thumbnail size.
- No embedded names, captions, logos, watermarks, arrows, UI controls, border, or rounded
  corners. The app places the exercise name beside the art and rounds its frame.

## Composition and delivery

Generate one standalone image per exercise in a **16:9 landscape composition**. Keep the
whole athlete and essential equipment visible with about 7% clearance around extremities.
Aim for roughly 80–85% height occupancy; adjust for tall machines and wide barbells.
Prefer a three-quarter view that makes the movement and equipment identifiable. Favor
stable poses over dramatic camera angles. Simplify machinery without changing its function.

The final runtime file is a correctly encoded **640×360 JPEG**, usually quality 90 with
optimized encoding. Recent assets are approximately 30–42 KB each; this is a useful
reference, not a hard limit. Keep high-resolution generation originals separately when
available. Do not rely on temporary workspace image paths as the only style memory.
An output with a different aspect ratio needs review before export: never stretch anatomy
or crop essential equipment to force the dimensions.

The shared `ExerciseVisual` uses `object-cover object-center` and **no extra CSS zoom**.
Review at actual 64×36 list size and approximately 114×64 header size, in both light and
dark app appearance. The full image must already work inside those frames.

## Durable reference images

The committed assets in `public/exercises/` are the approved visual reference set:

| Reference | Use |
| --- | --- |
| `bb-bench.jpg` | Barbell plates, clothing, horizontal bench composition |
| `bb-back-squat.jpg` | Standing athlete, squat anatomy, rear three-quarter view |
| `bb-rdl.jpg` | Hip hinge, clear bar-to-leg relationship |
| `db-shoulder-press.jpg` | Female athlete, dumbbells, seated bench |
| `hack-squat.jpg` | Plate-loaded machine, pads, rails, steel highlights |
| `lat-pulldown.jpg` | Tall cable machine and overhead pulley framing |
| `seated-cable-row.jpg` | Seated cable movement, handles, low pulley |

Inspect the relevant image before generating. For a new illustration, use the prompt
below and the observed reference styling. When editing an existing image, provide that
image as the generation tool's reference and specify exactly what to preserve/change.
Use the image-generation tool for visual creation and edits; final resize/encoding is
asset packaging. Image generation can vary, so inspect every output rather than assuming
the prompt guarantees correct anatomy, equipment, or framing.

## Reusable generation prompt

Copy this base and append one exercise-specific brief. Replace the placeholders;
never leave them in the submitted prompt.

```text
Create ONE standalone illustration of {EXERCISE}, in a 16:9 landscape composition.
It belongs to an existing strength-training app's B / Bold Charcoal exercise series.
Premium vintage sports illustration: confident near-black ink contours, finely hatched
warm ivory anatomy, sculpted light and shadow, restrained textured charcoal background
approximately #202225, and muted oxblood burgundy approximately #973f48 on training
clothing and selected equipment. Dark steel equipment has crisp ivory edge highlights.
Match the restrained, richly shaded hand-inked character of the series, not generic
flat clipart, photography, or a glossy 3D render. Strong silhouettes must remain legible
at 64x36 and 114x64. Natural athletic adult proportions, correct hands, fitted training
clothes, training shoes, and believable exercise mechanics. Soft compact grounding
shadow and subtle floor texture; no gym scenery or decorative background elements.
Show the whole athlete and essential equipment with about 7% perimeter clearance,
using approximately 80–85% of frame height. Prefer a clear three-quarter view.
NO text, labels, logos, watermarks, arrows, borders, rounded corners, review-sheet layout,
neon, bright halos, colored lighting, or extra limbs/equipment.
Exercise-specific pose and equipment: {EXERCISE_BRIEF}
```

## Exercise-specific review briefs

These three briefs were requested for previews on 2026-10-10. Their presence here does
not mean the illustrations have been installed; check `EXERCISE_VISUAL_SRC` for shipped art.

### Incline barbell bench press — `bb-incline-bench`

Three-quarter front/side view of an athletic male on an adjustable bench with its backrest
clearly inclined about 30 degrees above horizontal. Burgundy fitted tank, dark shorts,
training shoes planted on the floor. Head, shoulders, and hips supported, modest natural
arch. Barbell held just above the upper chest in the lowered position, elbows bent,
wrists stacked over forearms, coherent overhand grip. A straight bar with matching
burgundy round plates at both ends. Show the entire bench, its incline support, both
feet, both hands, and both plates. Distinguish clearly from a flat press or shoulder press.

### Bulgarian split squat — `db-split-squat`

Three-quarter side view of an athletic female holding one burgundy-ended dumbbell in
each hand with arms hanging naturally beside the torso. Burgundy fitted athletic top,
dark shorts or leggings, training shoes. Show the bottom of a rear-foot-elevated split
squat: front foot planted fully, front knee tracking over toes, front thigh near horizontal,
rear knee lowered toward the floor, rear foot resting on a low bench behind the athlete.
Slight forward torso lean, neutral spine, balanced hips. Both legs, front foot, elevated
rear foot, bench, and two distinct dumbbells must be visible. Do not turn it into a step-up,
ordinary lunge, or barbell squat. The seeded exercise uses dumbbells.

### Seated leg curl — `seated-leg-curl`

**Reference correction, 2026-10-10:** James rejected both earlier text-driven machine
previews and supplied a real photograph. Use the photograph as the structural reference
and restyle it; do not reuse the rejected illustrations or reconstruct the machine from
a generic side-view description. Preserve visible frame topology, adjustment hardware,
pad contacts, and the operating-arm arrangement before changing appearance.

The supplied photograph shows an athletic woman with her hair in a bun, viewed from
the front three-quarter angle. Her back rests against a slightly reclined backrest on
the right. A substantial broad rectangular thigh restraint holds her thighs above the
knees. Both hands hold upright vertical handles on top of that restraint mechanism in
front of her, rather than handles beside her hips. The selectorized tower stands on the
left, with a broad rounded top and a partially enclosed stack. The external operating
arm is to the left of the legs. A single cylindrical ankle roller sits behind the lower
calves below the seat, its end visible to their right. Her shins angle down and both
white shoes are fully visible. Preserve this pose and construction; do not invent an
A-frame, exposed cable routing, extra braces, or a different weight-stack position.

Apply the charcoal/ivory ink style, burgundy fitted top and upholstery, dark leggings,
and ivory shoes. Remove the gym background, signage, and camera/search overlay. Adapt
the portrait reference to landscape by adding quiet charcoal background beside the
assembly; retain the full athlete and machine. Reconstruct only minimally missing
frame extremities, following the observed construction.

Research source: [Hammer Strength Select Seated Leg Curl, HS-SLC](https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/hammer-strength-select-seated-leg-curl).
The manufacturer confirms adjustable back and thigh pads and an adjustable start
position. The supplied photograph governs this preview's visible geometry; its exact
machine model was not established. Avoid mixing components from different models.

Machine-specific rule for future artwork: find a real product/use photograph before
generation, pass it directly as an image reference, and preserve its geometry. Written
mechanics checks support the reference; they do not substitute for it. The earlier
seated-curl prompts were insufficient even after moving the roller behind the ankles.

## Review and integration checklist

1. Confirm the seeded identity and equipment in `src/lib/strength/coefficients.ts`.
   Write the pose brief before generation; specify bar path, contact points, cable path,
   or machine pivot when relevant.
2. Check silhouette, anatomy, grip, support/contact points, and exercise identity at full
   size. Reject duplicate limbs, floating equipment, impossible mechanisms, and the wrong
   exercise. Use another generation/edit pass if needed.
3. Review the whole composition at both real thumbnail sizes and against the approved
   reference set. Check light/dark appearance and that rounding does not hide extremities.
4. For a preview request, show the images for review. For authorized installation, export
   the final JPEG to `public/exercises/{seeded-id}.jpg` and add its seeded ID to
   `EXERCISE_VISUAL_SRC` in `src/lib/exercise-visual.ts`. Replace an existing asset in place
   when updating it. Names alone never choose artwork.
5. Preserve base-ID and `__`-prefix station inheritance and the decorative accessibility
   contract (`alt=""`, `aria-hidden`). Keep unknown/custom exercises on the existing
   dumbbell fallback. Do not create catalog records merely to attach art.
6. Follow `AGENTS.md` for checks, current owning documentation, and the close-session
   handoff. Preview generation and documentation alone do not require application tests.
