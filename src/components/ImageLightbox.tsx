"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Carousel, { type CarouselImage as CarouselFrameImage } from "@/components/Carousel";

interface CarouselImage {
  url: string;
  displayUrl?: string | null;
  isPrimary: boolean;
  order: number;
}

export default function ImageLightbox({
  images,
  title,
}: {
  images: CarouselImage[];
  title: string;
}) {
  const sorted = [...images].sort((a, b) => a.order - b.order);
  const primaryIdx = sorted.findIndex((img) => img.isPrimary);

  // Inline carousel state
  const [current, setCurrent] = useState(primaryIdx >= 0 ? primaryIdx : 0);

  // Lightbox state
  const [open, setOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);

  // Touch controls auto-hide
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Magnifier state
  const [showMag, setShowMag] = useState(false);
  const [magStyle, setMagStyle] = useState<React.CSSProperties>({});

  // useSyncExternalStore gives hydration-safe client-only values without
  // setState-in-effect (which triggers the react-hooks/set-state-in-effect rule).
  // Server snapshot = false; client snapshot = actual browser value.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const isTouch = useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia("(hover: none)");
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia("(hover: none)").matches,
    () => false,
  );

  const savedScrollY = useRef(0);
  const hasOpenedOnce = useRef(false);
  const touchStartX = useRef(0);

  // Scroll lock / restore
  useEffect(() => {
    if (open) {
      hasOpenedOnce.current = true;
      savedScrollY.current = window.scrollY;
      document.body.style.overflow = "hidden";
    } else if (hasOpenedOnce.current) {
      document.body.style.overflow = "";
      window.scrollTo(0, savedScrollY.current);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Auto-hide controls on touch: start 3s timer when lightbox opens
  useEffect(() => {
    if (!open || !isTouch) {
      setControlsVisible(true);
      return;
    }
    setControlsVisible(true);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [open, isTouch]);

  const bumpControlsTimer = useCallback(() => {
    if (!isTouch) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, [isTouch]);

  const closeLb = useCallback(() => {
    setOpen(false);
    setShowMag(false);
  }, []);

  const lbPrev = useCallback(() => {
    setLbIndex((i) => (i - 1 + sorted.length) % sorted.length);
  }, [sorted.length]);

  const lbNext = useCallback(() => {
    setLbIndex((i) => (i + 1) % sorted.length);
  }, [sorted.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLb();
      else if (e.key === "ArrowLeft") lbPrev();
      else if (e.key === "ArrowRight") lbNext();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closeLb, lbPrev, lbNext]);

  const openLightbox = (idx: number) => {
    setLbIndex(idx);
    setOpen(true);
  };

  // Magnifier: pixel-based background-size/position so zoom is relative to the
  // actual rendered lightbox image size (not the lens element size).
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const fracX = rect.width > 0 ? x / rect.width : 0.5;
    const fracY = rect.height > 0 ? y / rect.height : 0.5;
    const zoom = 2.5;
    const size = 200; // lens diameter px
    // Render the image at zoom× the displayed lightbox size, then position it
    // so the cursor position is centred in the lens.
    const W_bg = rect.width * zoom;
    const H_bg = rect.height * zoom;
    const bgX = size / 2 - fracX * W_bg;
    const bgY = size / 2 - fracY * H_bg;
    const lbImg = sorted[lbIndex];
    setShowMag(true);
    setMagStyle({
      position: "fixed",
      left: e.clientX - size / 2,
      top: e.clientY - size / 2,
      width: size,
      height: size,
      borderRadius: "50%",
      border: "2px solid white",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.4)",
      backgroundImage: `url(${lbImg.displayUrl ?? lbImg.url})`,
      backgroundSize: `${W_bg}px ${H_bg}px`,
      backgroundPosition: `${bgX}px ${bgY}px`,
      backgroundRepeat: "no-repeat",
      zIndex: 60,
      pointerEvents: "none",
    });
  };

  const handleMouseLeave = () => setShowMag(false);

  // Touch swipe + controls reveal
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    bumpControlsTimer();
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta > 50) lbPrev();
    else if (delta < -50) lbNext();
  };

  if (sorted.length === 0) {
    return (
      <div className="flex h-80 w-full items-center justify-center rounded-2xl bg-stone-100">
        <span className="text-sm text-stone-400">No image</span>
      </div>
    );
  }

  const lbImg = sorted[lbIndex];
  const lbSrc = lbImg.displayUrl ?? lbImg.url;

  // Inline frames for the shared Carousel (display variant when available).
  const frameImages: CarouselFrameImage[] = sorted.map((img) => ({ url: img.displayUrl ?? img.url }));

  // Controls are always visible on pointer devices; on touch they fade after idle
  const controlsCls = isTouch
    ? `transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`
    : "";

  const lightboxOverlay = open ? (
    <div
      data-testid="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — full-screen view`}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onTouchStart={bumpControlsTimer}
    >
      {/* Backdrop */}
      <div
        data-testid="lightbox-backdrop"
        className="absolute inset-0 bg-black/80"
        onClick={closeLb}
      />

      {/* Centred image */}
      <div className="relative z-10 flex items-center justify-center p-4">
        <div
          data-testid="lightbox-img-container"
          className="relative"
          onMouseMove={!isTouch ? handleMouseMove : undefined}
          onMouseLeave={!isTouch ? handleMouseLeave : undefined}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lbSrc}
            alt={`${title} — image ${lbIndex + 1}`}
            className="max-h-[90vh] max-w-[90vw] object-contain select-none"
            draggable={false}
          />
        </div>
      </div>

      {/* Close button */}
      <button
        aria-label="Close lightbox"
        onClick={closeLb}
        className={`absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-xl text-white hover:bg-black/80 transition-colors ${controlsCls}`}
      >
        ×
      </button>

      {/* Navigation — only when multiple images */}
      {sorted.length > 1 && (
        <>
          <button
            aria-label="Previous image"
            onClick={(e) => {
              e.stopPropagation();
              lbPrev();
            }}
            className={`absolute left-4 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-xl text-white hover:bg-black/80 transition-colors ${controlsCls}`}
          >
            ‹
          </button>
          <button
            aria-label="Next image"
            onClick={(e) => {
              e.stopPropagation();
              lbNext();
            }}
            className={`absolute right-4 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-xl text-white hover:bg-black/80 transition-colors ${controlsCls}`}
          >
            ›
          </button>
          <div className={`absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white select-none ${controlsCls}`}>
            {lbIndex + 1} / {sorted.length}
          </div>
        </>
      )}

      {/* Magnifier */}
      {!isTouch && showMag && (
        <div data-testid="magnifier" style={magStyle} />
      )}
    </div>
  ) : null;

  return (
    <>
      {/* Inline carousel — the shared Carousel (same as the apparel listing page).
          Clicking the main image opens the fullscreen lightbox + magnifier below.
          Keyboard nav is handed to the lightbox while it's open so they don't both
          move. */}
      <Carousel
        images={frameImages}
        title={title}
        index={current}
        onIndexChange={setCurrent}
        onActivate={openLightbox}
        activateLabel="Open image in fullscreen"
        enableKeyboard={!open}
      />

      {/* Lightbox portal — only after client mount */}
      {mounted && createPortal(lightboxOverlay, document.body)}
    </>
  );
}
