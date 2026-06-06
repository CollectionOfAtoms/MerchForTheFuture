/**
 * Creates three test accounts for local/staging use:
 *   admin@artandsol.test  / Admin123!    roles: [ADMIN, SELLER]
 *   seller@artandsol.test / Seller123!   roles: [SELLER]
 *   buyer@artandsol.test  / Buyer123!    roles: [BUYER]
 *
 * Run with:
 *   npx tsx scripts/seed-test-users.ts
 *
 * Requires DATABASE_URL (or DATABASE_URL_TEST) in .env / .env.local.
 * Uses upsert — safe to re-run.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient, Role } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const connectionString =
  process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? "";

if (!connectionString) {
  console.error("No DATABASE_URL found. Set it in .env or .env.local.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

async function hash(pw: string) {
  return bcrypt.hash(pw, 12);
}

const accounts = [
  {
    email: "admin@artandsol.test",
    name: "Admin User",
    password: "Admin123!",
    roles: [Role.ADMIN, Role.SELLER],
  },
  {
    email: "seller@artandsol.test",
    name: "Test Seller",
    password: "Seller123!",
    roles: [Role.SELLER],
  },
  {
    email: "buyer@artandsol.test",
    name: "Test Buyer",
    password: "Buyer123!",
    roles: [Role.BUYER],
  },
];

async function main() {
  for (const account of accounts) {
    const passwordHash = await hash(account.password);
    await prisma.user.upsert({
      where: { email: account.email },
      update: { passwordHash, roles: account.roles, emailVerified: new Date() },
      create: {
        email: account.email,
        name: account.name,
        passwordHash,
        roles: account.roles,
        emailVerified: new Date(),
      },
    });
    console.log(`✓  ${account.email}  [${account.roles.join(", ")}]  pw: ${account.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
