const MIN_DPI = 300;

interface ResolutionInput {
  widthPx: number;
  heightPx: number;
  targetWidthIn: number;
  targetHeightIn: number;
}

export interface ResolutionWarning {
  valid: boolean;
  dpi: number;
  warnings: string[];
}

export function validateImageResolution(input: ResolutionInput): ResolutionWarning {
  const { widthPx, heightPx, targetWidthIn, targetHeightIn } = input;

  const dpiWidth = widthPx / targetWidthIn;
  const dpiHeight = heightPx / targetHeightIn;
  const dpi = Math.min(dpiWidth, dpiHeight);

  const warnings: string[] = [];

  if (dpi < MIN_DPI) {
    warnings.push(
      `Image resolution is ${Math.round(dpi)} DPI, which is below the minimum 300 DPI required for this print size (${targetWidthIn}x${targetHeightIn}"). ` +
        `Please use a higher resolution image (at least ${Math.ceil(targetWidthIn * MIN_DPI)}x${Math.ceil(targetHeightIn * MIN_DPI)} pixels).`
    );
  }

  return {
    valid: dpi >= MIN_DPI,
    dpi: Math.round(dpi),
    warnings,
  };
}
