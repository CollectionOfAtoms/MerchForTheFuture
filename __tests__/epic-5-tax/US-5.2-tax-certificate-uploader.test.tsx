// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TaxCertificateUploader from "@/components/TaxCertificateUploader";

vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));
vi.mock("@/app/actions/tax", () => ({ uploadTaxCertificateAction: vi.fn() }));

describe("US-5.2 — TaxCertificateUploader", () => {
  it("renders an upload control and the exemption-type selector", () => {
    render(<TaxCertificateUploader currentStatus={null} />);
    expect(screen.getByText(/Upload exemption certificate/i)).toBeTruthy();
    expect(screen.getByText(/Exemption type/i)).toBeTruthy();
  });

  it("shows the approved badge when the buyer is exempt", () => {
    render(<TaxCertificateUploader currentStatus="APPROVED" />);
    expect(screen.getByText(/Approved — tax-exempt/i)).toBeTruthy();
  });

  it("shows the under-review badge for a pending certificate", () => {
    render(<TaxCertificateUploader currentStatus="PENDING" />);
    expect(screen.getByText(/Under review/i)).toBeTruthy();
  });
});
