-- US-18.4: seller-chosen focal point for the square browse-grid crop.
-- Additive; DEFAULT 0.5 (centre) backfills existing rows, so tiles are unchanged.
ALTER TABLE "ArtworkImage"
  ADD COLUMN "focalX" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "focalY" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
