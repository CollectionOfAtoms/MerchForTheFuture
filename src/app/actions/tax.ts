"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { stripe } from "@/lib/payments/stripe";
import { ensureBuyerStripeCustomer } from "@/lib/tax/customer";

type ActionResult = { error: string } | { success: true };

async function requireAuthUser() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  return { id: user.id, roles: user.roles ?? [] };
}

const VALID_TYPES = new Set(["exempt", "reverse"]);

/** Buyer uploads a tax-exemption certificate (blob URL). Creates a PENDING row. */
export async function uploadTaxCertificateAction(
  fileUrl: string,
  exemptionType: string = "exempt",
): Promise<ActionResult> {
  const { id: userId } = await requireAuthUser();
  if (!fileUrl?.trim()) return { error: "A certificate file is required." };
  const type = VALID_TYPES.has(exemptionType) ? exemptionType : "exempt";

  await prisma.taxExemptionCertificate.create({
    data: { userId, fileUrl: fileUrl.trim(), exemptionType: type, status: "PENDING" },
  });
  revalidatePath("/buyer/settings");
  return { success: true };
}

async function requireAdmin(): Promise<{ id: string } | { error: string }> {
  const { id, roles } = await requireAuthUser();
  if (!roles.includes("ADMIN")) return { error: "Forbidden." };
  return { id };
}

/**
 * Admin approves a certificate: mark APPROVED, ensure the buyer has a Stripe
 * Customer, and set its `tax_exempt` to the certificate's type so Stripe Tax
 * stops collecting at checkout for that buyer.
 */
export async function approveTaxCertificateAction(certificateId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const cert = await prisma.taxExemptionCertificate.findUnique({ where: { id: certificateId } });
  if (!cert) return { error: "Certificate not found." };

  const customerId = await ensureBuyerStripeCustomer(cert.userId);
  await stripe.customers.update(customerId, {
    tax_exempt: cert.exemptionType === "reverse" ? "reverse" : "exempt",
  });

  await prisma.taxExemptionCertificate.update({
    where: { id: certificateId },
    data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date() },
  });

  revalidatePath("/admin/tax");
  revalidatePath("/buyer/settings");
  return { success: true };
}

/** Admin rejects a certificate. Does not touch the Stripe Customer. */
export async function rejectTaxCertificateAction(certificateId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const cert = await prisma.taxExemptionCertificate.findUnique({ where: { id: certificateId } });
  if (!cert) return { error: "Certificate not found." };

  await prisma.taxExemptionCertificate.update({
    where: { id: certificateId },
    data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: new Date() },
  });
  revalidatePath("/admin/tax");
  revalidatePath("/buyer/settings");
  return { success: true };
}
