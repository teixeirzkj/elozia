import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listPackageOptions } from "@/modules/catalog/queries";
import { listTemplates } from "@/modules/channels/queries";
import { listTags } from "@/modules/contacts/queries";
import { listStages } from "@/modules/pipeline/queries";
import { listActiveMembers } from "@/modules/settings/queries";

/** Tudo o que os formulários de automação e campanha precisam oferecer como opção. */
export async function loadRuleOptions(supabase: SupabaseClient, orgId: string) {
  const [stages, packages, tags, members, templates] = await Promise.all([
    listStages(supabase, orgId),
    listPackageOptions(supabase, orgId),
    listTags(supabase, orgId),
    listActiveMembers(supabase, orgId),
    listTemplates(supabase, orgId, { approvedOnly: true }),
  ]);
  return { stages, packages, tags, members, templates: templates.filter((t) => t.spec.supported) };
}
