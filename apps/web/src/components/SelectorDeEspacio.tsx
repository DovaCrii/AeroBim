import { ESPACIOS, TITULO_DE_ESPACIO, type Espacio } from "../espacios.js";

/**
 * El selector de espacio: **Modelo 3D | Planos 2D y perfiles**.
 *
 * Es un grupo de dos botones y no un menú: son dos y se alterna entre ellos todo el día, y un menú
 * pondría un clic de más en cada cambio. `aria-pressed` y no `role="tab"`, porque no controla un
 * panel propio —cambia qué se muestra en la misma pantalla— y un `tablist` prometería un teclado
 * de pestañas que no tiene.
 *
 * **El número en «Planos y perfiles»** es lo que mantiene a la vista lo que el otro espacio
 * esconde: desde el 3D no se ven los planos abiertos, y sin la cuenta nadie sabría que hay un perfil
 * esperando después de generarlo.
 */
export function SelectorDeEspacio({
  espacio,
  onCambiar,
  cuantosPlanos,
}: {
  readonly espacio: Espacio;
  readonly onCambiar: (espacio: Espacio) => void;
  /** Planos abiertos y generados, que viven en «Planos y perfiles». */
  readonly cuantosPlanos: number;
}) {
  return (
    <div
      role="group"
      aria-label="Espacio de trabajo"
      className="flex shrink-0 items-center rounded-md border border-borde p-0.5 text-xs"
    >
      {ESPACIOS.map((cual) => {
        const activo = cual === espacio;
        return (
          <button
            key={cual}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambiar(cual)}
            title={
              cual === "modelo"
                ? "Modelo 3D — el modelo, la nube, los cortes y la coordinación"
                : "Planos 2D y perfiles — los planos 2D, los perfiles generados y sus láminas"
            }
            className={[
              "rounded-sm px-2.5 py-1 transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
              activo ? "bg-action font-medium text-sobre-accion" : "text-fg-2 hover:text-fg",
            ].join(" ")}
          >
            {TITULO_DE_ESPACIO[cual]}
            {cual === "planos" && cuantosPlanos > 0 && (
              <span className="ml-1.5 tabular-nums opacity-80">{cuantosPlanos}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
