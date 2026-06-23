"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { uploadTaxCertificateAction } from "@/app/actions/tax";

interface TaxCertificateUploaderProps {
  /** Status of the buyer's latest certificate, if any. */
  currentStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
}

const STATUS_COPY: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Under review", className: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Approved — tax-exempt", className: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Not approved", className: "bg-rose-100 text-rose-800" },
};

/**
 * Buyer tax-exemption certificate upload (US-5.2). Uploads a PDF/image to Blob,
 * then records a PENDING certificate for admin review. Once an admin approves it,
 * the buyer's Stripe Customer is marked tax-exempt and Stripe Tax stops collecting.
 */
export default function TaxCertificateUploader({ currentStatus }: TaxCertificateUploaderProps) {
  const [status, setStatus] = useState<string | null>(currentStatus ?? null);
  const [exemptionType, setExemptionType] = useState("exempt");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const blob = await upload(`tax-certificates/${crypto.randomUUID()}${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/certificate",
      });
      const result = await uploadTaxCertificateAction(blob.url, exemptionType);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setStatus("PENDING");
        setSubmitted(true);
      }
    } catch {
      setError("Certificate upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const badge = status ? STATUS_COPY[status] : null;

  return (
    <div className="space-y-3">
      {badge && (
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      )}
      {submitted && (
        <p className="text-sm text-stone-600">
          Thanks — your certificate was submitted for review. We&apos;ll apply your exemption once it&apos;s approved.
        </p>
      )}

      <label className="block text-sm text-stone-700">
        Exemption type
        <select
          value={exemptionType}
          onChange={(e) => setExemptionType(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="exempt">Exempt (nonprofit / government / resale)</option>
          <option value="reverse">Reverse charge (EU/UK business VAT)</option>
        </select>
      </label>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="sr-only"
        onChange={onFile}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="rounded-lg border border-dashed border-stone-300 px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors disabled:opacity-50"
      >
        {uploading ? "Uploading…" : status ? "Upload a new certificate" : "Upload exemption certificate"}
      </button>

      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
