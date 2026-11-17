import { redirect } from "next/navigation";

/** Rota antiga: colaboradores e convites agora ficam em /configuracoes/usuarios. */
export default function EquipeRedirectPage() {
  redirect("/configuracoes/usuarios");
}
