import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const users = await prisma.user.findMany({
  select: { id: true, email: true, emailVerified: true, roles: true, createdAt: true },
  orderBy: { createdAt: "desc" },
});

console.log(`${users.length} user(s) found:`);
users.forEach((u) => console.log(u));
await prisma.$disconnect();
