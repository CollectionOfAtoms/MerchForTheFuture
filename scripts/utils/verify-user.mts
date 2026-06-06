import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/verify-user.mts <email>");
  process.exit(1);
}

const user = await prisma.user.update({
  where: { email },
  data: { emailVerified: new Date() },
  select: { id: true, email: true, emailVerified: true, roles: true },
});

console.log("Verified:", user);
await prisma.$disconnect();
