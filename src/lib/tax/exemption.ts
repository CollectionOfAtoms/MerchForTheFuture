import { prisma } from "@/lib/db";

interface TaxExemptionData {
  certificateId: string;
  exemptionType: string;
  state: string;
  expiresAt: Date;
}

interface StoredExemption {
  certificateId: string;
  exemptionType: string;
  state: string;
  expiresAt: string;
}

export async function isTaxExempt(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.taxExemption) return false;

  const exemption = user.taxExemption as unknown as StoredExemption;
  if (!exemption.certificateId) return false;

  const expires = new Date(exemption.expiresAt);
  return expires > new Date();
}

export async function getTaxExemption(userId: string): Promise<TaxExemptionData | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.taxExemption) return null;

  const exemption = user.taxExemption as unknown as StoredExemption;
  if (!exemption.certificateId) return null;

  return {
    certificateId: exemption.certificateId,
    exemptionType: exemption.exemptionType,
    state: exemption.state,
    expiresAt: new Date(exemption.expiresAt),
  };
}

export async function setTaxExemption(
  userId: string,
  data: TaxExemptionData | null
): Promise<void> {
  if (!data) {
    await prisma.user.update({
      where: { id: userId },
      data: { taxExemption: {} },
    });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      taxExemption: {
        certificateId: data.certificateId,
        exemptionType: data.exemptionType,
        state: data.state,
        expiresAt: data.expiresAt.toISOString(),
      },
    },
  });
}
