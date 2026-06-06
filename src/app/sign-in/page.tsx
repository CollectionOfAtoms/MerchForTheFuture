import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SignInForm from "./SignInForm";

export default async function SignInPage() {
  const session = await auth();
  const user = session?.user as { roles?: string[] } | undefined;

  if (user) {
    const roles = user.roles ?? [];
    if (roles.includes("ADMIN")) redirect("/dashboard/admin");
    else if (roles.includes("SELLER")) redirect("/dashboard/seller");
    else redirect("/dashboard/buyer");
  }

  return <SignInForm />;
}
