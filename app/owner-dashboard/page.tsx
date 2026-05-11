import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { OwnerDashboardClient } from "./owner-dashboard-client";

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export default async function OwnerDashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const ownerUserId = (process.env.OWNER_CLERK_USER_ID ?? "").trim();
  if (ownerUserId && userId === ownerUserId) {
    return <OwnerDashboardClient />;
  }

  const user = await currentUser();
  const email = normalizeEmail(user?.primaryEmailAddress?.emailAddress);
  const owner = normalizeEmail(process.env.OWNER_EMAIL);

  if (!owner || !email || email !== owner) {
    redirect("/documents");
  }

  return <OwnerDashboardClient />;
}
