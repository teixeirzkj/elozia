"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { PROPOSAL_STATUS_LABELS, type ProposalStatus } from "@/modules/crm/types";
import { setProposalStatusAction } from "../actions";

/** Troca rápida da situação de uma proposta. */
export function ProposalStatusMenu({ opportunityId, proposalId, status }: { opportunityId: string; proposalId: string; status: ProposalStatus }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <select
      aria-label="Situação da proposta"
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as ProposalStatus;
        startTransition(async () => {
          const result = await setProposalStatusAction(opportunityId, proposalId, next);
          if (result.ok) toast.success(result.message ?? "Proposta atualizada.");
          else toast.error(result.error ?? "Não foi possível atualizar a proposta.");
        });
      }}
      className="cursor-pointer rounded-md border border-line-strong bg-surface px-2 py-1.5 text-[13px]"
    >
      {Object.entries(PROPOSAL_STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
