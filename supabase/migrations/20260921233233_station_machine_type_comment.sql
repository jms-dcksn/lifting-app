-- Station composition (Slice 2): document expanded machine_type sentinels.
-- Comment only. No CHECK, no column rename, no unique-index rewrite.
-- 0008 remains the column add; bench/rack/platform are identity tags like
-- selectorized/plate_loaded — not engine math and not a plate/stack UI.

comment on column exercise.machine_type is
  'selectorized|plate_loaded|bench|rack|platform|null';
