import type { FichaCompartida } from "../compartido.js";

/**
 * Qué está mirando quien entró por un enlace, **y hasta cuándo**.
 *
 * Ocupa el sitio que `Origen` ocupa en la sesión con cuenta, y dice otra cosa porque la persona es
 * otra: `Origen` sirve para **volver** al expediente, y quien viene de fuera no tiene expediente al
 * que volver. Lo que necesita es lo contrario — saber qué es esto, porque no lo sabe.
 *
 * ## Por qué la idoneidad va aquí y en grande
 *
 * Es el dato que evita el malentendido caro. Un modelo en `S2` es trabajo compartido para
 * coordinar; uno en `A` está aprobado para construir. **Quien mira desde fuera es exactamente quien
 * puede confundirlos**, porque no ha visto el resto del expediente y lo que le llegó fue un enlace
 * sin contexto — que es como llega un plano por WhatsApp, y por eso se construye con preliminares.
 *
 * Enseñar el modelo sin decir para qué sirve es la mitad del problema que el registro documental
 * existe para resolver, así que el enlace no puede reintroducirlo.
 *
 * ## Y por qué se dice cuándo caduca
 *
 * Para que quien lo recibe sepa que **esto no es su copia**. Un enlace sin fecha se guarda en
 * favoritos y se vuelve a abrir en marzo; con la fecha delante, quien lo necesite más allá pide
 * otro, que es la conversación que corresponde.
 */
export function Compartido({ ficha }: { readonly ficha: FichaCompartida | null }) {
  if (ficha === null) return null;

  const caduca = new Date(ficha.expiraEn).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-fg-2">
      <span className="truncate font-semibold text-fg" title={ficha.entregable.titulo}>
        {ficha.entregable.codigo}
      </span>
      <Separador />
      <span className="shrink-0">rev. {ficha.correlativo}</span>
      <Separador />
      {/* **Solo `idoneidadTexto`, porque ya trae el código dentro.**
          `get_idoneidad_display()` devuelve «A · Publicado y autorizado», así que poner el código
          al lado lo escribía dos veces: «A A · Publicado y autorizado». Se vio en la pantalla, con
          el modelo abierto desde un enlace de verdad. */}
      <span className="shrink-0 rounded border border-borde px-1.5 py-0.5 text-fg">
        {ficha.idoneidadTexto}
      </span>
      <Separador />
      <span className="shrink-0" title="Después de esta fecha el enlace deja de funcionar">
        vence {caduca}
      </span>
    </div>
  );
}

function Separador() {
  return (
    <span aria-hidden="true" className="shrink-0 text-fg-3">
      ›
    </span>
  );
}
