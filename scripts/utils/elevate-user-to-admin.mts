import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../src/generated/prisma/client";

const email = process.argv[2]?.toLowerCase();

if (!email) {
  console.error("Usage: npx tsx --env-file=.env.local scripts/utils/elevate-user-to-admin.mts <email>");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const user = await prisma.user.findUnique({
  where: { email },
  select: { id: true, email: true, roles: true },
});

if (!user) {
  console.error(`No user found with email: ${email}`);
  await prisma.$disconnect();
  process.exit(1);
}

if (user.roles.includes("ADMIN")) {
  console.log(`${email} is already an admin.`);
  await prisma.$disconnect();
  process.exit(0);
}

const updated = await prisma.user.update({
  where: { email },
  data: { roles: { push: "ADMIN" } },
  select: { email: true, roles: true },
});

console.log(`Done. ${updated.email} roles: ${updated.roles.join(", ")}`);
await prisma.$disconnect();
