"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useFormState } from "@/components/ui/form";
import type { Option } from "@/modules/crm/types";
import { searchContactsAction } from "../actions";

/** Seletor de contato com busca no servidor. Envia o id em um campo oculto. */
export function ContactPicker({ name = "contact_id", initial, locked = false }: { name?: string; initial?: Option | null; locked?: boolean }) {
  const id = useId();
  const { state } = useFormState();
  const error = state.fieldErrors?.[name]?.[0];
  const [selected, setSelected] = useState<Option | null>(initial ?? null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (selected || !open) return;
    const request = ++requestRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const found = await searchContactsAction(term);
      if (request === requestRef.current) {
        setResults(found);
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [term, open, selected]);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-semibold">
        Contato <span className="text-danger" aria-hidden="true">*</span>
      </label>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="elz-field flex items-center justify-between gap-2">
          <span className="truncate">{selected.name}</span>
          {!locked ? (
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setTerm("");
                setOpen(true);
              }}
              aria-label="Trocar contato"
              className="cursor-pointer rounded p-0.5 text-fg-subtle hover:text-fg"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="relative">
          <input
            id={id}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Buscar por nome ou telefone"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-lista`}
            aria-invalid={Boolean(error)}
            className="elz-field"
          />
          {open ? (
            <ul
              id={`${id}-lista`}
              role="listbox"
              className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-pop"
            >
              {loading && results.length === 0 ? <li className="px-3 py-2 text-[13px] text-fg-subtle">Buscando…</li> : null}
              {!loading && results.length === 0 ? (
                <li className="px-3 py-2 text-[13px] text-fg-subtle">Nenhum contato encontrado. Cadastre-o em Contatos.</li>
              ) : null}
              {results.map((option) => (
                <li key={option.id} role="option" aria-selected="false">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(option);
                      setOpen(false);
                    }}
                    className="w-full cursor-pointer rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {option.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          Selecione um contato.
        </p>
      ) : null}
    </div>
  );
}
