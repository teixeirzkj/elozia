"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, textAlign: "center" }}>
        <h1 style={{ fontSize: 20 }}>Algo deu errado</h1>
        <p style={{ color: "#52525b" }}>Ocorreu um erro inesperado. Tente novamente.</p>
        <button
          type="button"
          onClick={reset}
          style={{ marginTop: 16, padding: "10px 16px", borderRadius: 10, background: "#0A0A0A", color: "#fff", border: 0, cursor: "pointer" }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
