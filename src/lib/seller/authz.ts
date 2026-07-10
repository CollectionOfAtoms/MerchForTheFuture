import { auth } from "@/auth";
import { canManageListing } from "@/lib/seller/listing-status";

/**
 * Authorization seam for managing listings (US: open editing to admins as well as
 * the owning seller). The two roles stay architecturally distinct — this is the
 * single place that grants both the right to *manage* an existing listing — so
 * future role differentiation only has to change here.
 */
export interface Actor {
  id: string;
  roles: string[];
}

/** The signed-in actor (id + roles), or null when signed out. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  return user?.id ? { id: user.id, roles: user.roles ?? [] } : null;
}

/**
 * The actor if they may manage listings at all (a SELLER or an ADMIN), else null.
 * Per-listing authorization is then a separate `canManageListing(actor, sellerId)`
 * check: an admin may manage any listing; a seller only their own.
 */
export async function getManagerActor(): Promise<Actor | null> {
  const actor = await getActor();
  if (!actor) return null;
  return actor.roles.includes("SELLER") || actor.roles.includes("ADMIN") ? actor : null;
}

export { canManageListing };
