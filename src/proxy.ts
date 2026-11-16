import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/entrar", "/cadastro", "/recuperar-senha", "/convite", "/auth", "/configuracao-pendente"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Renova a sessão do Supabase e faz a primeira barreira de rotas.
 * A autorização de verdade acontece no servidor (requireMembership) e no banco (RLS).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (pathname === "/configuracao-pendente") return NextResponse.next();
    return NextResponse.redirect(new URL("/configuracao-pendente", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user && !isPublic(pathname)) {
    const target = new URL("/entrar", request.url);
    if (pathname !== "/") target.searchParams.set("proximo", pathname + request.nextUrl.search);
    return NextResponse.redirect(target);
  }
  if (user && (pathname === "/entrar" || pathname === "/cadastro" || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return response;
}

export const config = {
  // Tudo, exceto arquivos estáticos e rotas de API (webhook e cron têm autenticação própria).
  matcher: ["/((?!_next/static|_next/image|api/|favicon.ico|icon.png|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
