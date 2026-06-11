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
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "Notification","Transaction","Order","Bid","Auction","OriginalListing","ArtworkImage","Artwork","UserAddress","Session","Account","VerificationToken","PasswordResetToken","EmailVerificationToken","User","ProductTypeSizeOption","ProductTypeColor","ProductType" RESTART IDENTITY CASCADE`
  );
}

export { prisma };
