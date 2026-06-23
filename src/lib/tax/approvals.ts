import { prisma } from "@/lib/db";

/** A pending tax-exemption certificate awaiting admin review (US-5.2/5.3). */
export interface TaxCertificateApprovalRow {
  certificateId: string;
  userId: string;
  buyerName: string;
  buyerEmail: string;
  exemptionType: string;
  fileUrl: string;
  uploadedAt: Date;
}

/** Pending certificates, oldest first, for the admin Tax page approval queue. */
export async function getPendingTaxCertificateQueue(): Promise<TaxCertificateApprovalRow[]> {
  const rows = await prisma.taxExemptionCertificate.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({
    certificateId: r.id,
    userId: r.userId,
    buyerName: r.user.name ?? "(no name)",
    buyerEmail: r.user.email,
    exemptionType: r.exemptionType,
    fileUrl: r.fileUrl,
    uploadedAt: r.createdAt,
  }));
}

/** Count of pending certificates (admin nav badge). */
export async function countPendingTaxCertificates(): Promise<number> {
  return prisma.taxExemptionCertificate.count({ where: { status: "PENDING" } });
}
