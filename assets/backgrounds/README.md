# Mockup background designs

Drop background design source images here (`.png`, `.jpg`, `.webp`), one file per
design. The filename becomes the design's id + label (e.g. `sunburst.png` →
id `sunburst`, label "Sunburst"). Square-ish art works best since these composite
behind (transparent) apparel mockups.

Then process them into thumbnails + full images and publish to Vercel Blob:

```
npx tsx --env-file=.env.local scripts/process-backgrounds.ts
```

That script (see `scripts/process-backgrounds.ts`):
- generates a 240×240 `cover` **thumbnail** (for the seller picker) and a
  ≤1400px **full** image (composited behind the mockup) with `sharp`,
- uploads both to Vercel Blob,
- records `{ id, label, thumbUrl, fullUrl }` in
  `src/lib/apparel/background-designs.json` (the picker reads this).

It's idempotent by filename slug — already-processed designs are skipped. Pass
`--force` to reprocess everything (e.g. after re-exporting a design).
