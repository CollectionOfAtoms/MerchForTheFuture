import type { PrintReadiness } from "@/lib/print/framing";

interface PrintReadinessBannerProps {
  readiness: PrintReadiness;
  /** Map of size SKU → human label for the missing-mockup list. */
  sizeLabels?: Record<string, string>;
}

/**
 * Advisory banner enumerating what blocks a prints-enabled listing from going ACTIVE
 * (US-MFTF-PF.4): every unframed aspect, every aspect needing a reframe, and every size
 * missing a buyer mockup, each with a link to the control that fixes it. Server-side
 * enforcement in the status actions is the source of truth; this is guidance only.
 */
export default function PrintReadinessBanner({ readiness, sizeLabels }: PrintReadinessBannerProps) {
  if (!readiness.enabled || readiness.ready) return null;

  const needsReframe = new Set(readiness.needsReframeAspects);
  const unframed = readiness.missingAspects.filter((a) => !needsReframe.has(a));

  return (
    <section
      role="alert"
      data-testid="print-readiness-banner"
      className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-3"
    >
      <h2 className="text-sm font-semibold text-amber-800">
        This print listing can&apos;t go live yet
      </h2>
      <ul className="space-y-1.5 text-sm text-amber-800">
        {unframed.map((aspect) => (
          <li key={`unframed-${aspect}`}>
            Aspect <strong>{aspect}</strong> needs framing —{" "}
            <a href="#print-framing" className="underline hover:no-underline">
              frame it
            </a>
          </li>
        ))}
        {readiness.needsReframeAspects.map((aspect) => (
          <li key={`reframe-${aspect}`}>
            Aspect <strong>{aspect}</strong> needs a reframe (source art changed) —{" "}
            <a href="#print-framing" className="underline hover:no-underline">
              reframe it
            </a>
          </li>
        ))}
        {readiness.missingSizes.map((sku) => (
          <li key={`mockup-${sku}`}>
            Size <strong>{sizeLabels?.[sku] ?? sku}</strong> needs a buyer mockup —{" "}
            <a href="#print-config" className="underline hover:no-underline">
              add one
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
