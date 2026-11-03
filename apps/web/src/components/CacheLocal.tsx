import { useEffect, useState } from "react";
import { resumenDeCache, vaciarCache } from "../cache-modelos.js";
import { formatoMb } from "../progreso-carga.js";

/**
 * Lo que el navegador recuerda de los modelos del registro ya convertidos, y cómo vaciarlo.
 *
 * Son los Fragments de cada revisión abierta (ver `cache-modelos.ts`): la siguiente apertura de la
 * misma revisión no descarga ni convierte. Quien lo vacía solo paga otra descarga y otra conversión
 * la próxima vez; los archivos del registro no se tocan. Si el navegador no deja usar
 * IndexedDB (modo privado), no se muestra nada: no hay caché que gestionar.
 */
export function CacheLocal({
  version,
  onCambio,
}: {
  /** Cambia cuando la caché se escribió desde fuera de este componente, para releerla. */
  readonly version: number;
  readonly onCambio: () => void;
}) {
  const [resumen, setResumen] = useState<{ modelos: number; bytes: number } | null>(null);
  const [vaciando, setVaciando] = useState(false);

  useEffect(() => {
    let vigente = true;
    void resumenDeCache().then((r) => {
      if (vigente) setResumen(r);
    });
    return () => {
      vigente = false;
    };
  }, [version]);

  if (resumen === null) return null;

  return (
    <div className="flex items-center gap-2 border-t border-borde px-2 py-1.5 text-xs text-fg-2">
      <span
        className="min-w-0 flex-1"
        title="Modelos del registro ya convertidos, guardados en este navegador"
      >
        Caché local:{" "}
        {resumen.modelos === 0
          ? "vacía"
          : `${resumen.modelos} ${resumen.modelos === 1 ? "modelo" : "modelos"} · ${formatoMb(resumen.bytes)}`}
      </span>
      <button
        type="button"
        disabled={resumen.modelos === 0 || vaciando}
        onClick={() => {
          setVaciando(true);
          void vaciarCache().then(() => {
            setVaciando(false);
            onCambio();
          });
        }}
        className="shrink-0 rounded border border-borde px-1.5 py-0.5 text-fg-2 hover:text-danger disabled:opacity-50"
        title="Borra los modelos guardados en este navegador. Los archivos del registro no se tocan; la próxima apertura vuelve a descargar y convertir."
      >
        Vaciar caché local
      </button>
    </div>
  );
}
