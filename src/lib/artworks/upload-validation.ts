export const UPLOAD_MAX_BYTES = 70 * 1024 * 1024; // 70 MB

export const ACCEPTED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
];

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateUpload(file: {
  size: number;
  type: string;
}): ValidationResult {
  if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "Unsupported format. Use JPEG, PNG, TIFF, or WebP.",
    };
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return { valid: false, error: "File exceeds 70 MB limit." };
  }
  return { valid: true };
}
