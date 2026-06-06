import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";

// DATABASE_URL is injected by vitest.config.ts test.env before modules load.
// To use a separate test DB: set DATABASE_URL_TEST in .env.local.
const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? "";

function createClient() {
  const adapter = new PrismaNeon({ connectionString: url });
  return new PrismaClient({ adapter });
}

const prisma = createClient();

export async function resetDatabase() {
  await prisma.notification.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.order.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.auction.deleteMany();
  await prisma.originalListing.deleteMany();
  await prisma.artworkImage.deleteMany();
  await prisma.artwork.deleteMany();
  await prisma.userAddress.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.user.deleteMany();
}

export { prisma };
