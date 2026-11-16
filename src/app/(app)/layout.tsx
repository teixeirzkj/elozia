import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireMembership } from "@/lib/auth/session";
import { NAV_ITEMS } from "@/components/layout/nav";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { signOutAction } from "@/modules/auth/actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, membership } = await requireMembership();
  return (
    <AppShell
      agencyName={membership.organization.name}
      userName={user.fullName}
      userEmail={user.email}
      roleLabel={ROLE_LABELS[membership.role]}
      signOut={signOutAction}
      hiddenNav={NAV_ITEMS.filter((item) => item.requires && !can(membership.role, item.requires)).map((item) => item.href)}
    >
      {children}
    </AppShell>
  );
}
