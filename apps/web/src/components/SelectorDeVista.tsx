import type { StandardView } from "@aerobim/viewer";
import { BotonFlotante, GrupoFlotante, PanelFlotante } from "./PanelFlotante.js";
import { IconViewFront, IconViewIso, IconViewSide, IconViewTop } from "./icons.js";

/**
 * El selector de vista, arriba a la derecha del lienzo: **Isométrica · Planta · Frontal · Lateral**.
 *
 * **Sustituye al cubo de vistas y al grupo «Vistas» de la cinta**, que eran dos copias de lo mismo
 * (2026-10-05). El cubo era un dibujo SVG **estático** de unos 158 px: no giraba con la cámara, así
 * que lo único que decía era cuál fue la última vista elegida —justo lo que dice un botón activo—, y
 * a cambio ocupaba un cuadrado de lienzo entero con los nombres tumbados para que cupieran. Aquí son
 * cuatro botones en una fila, con el mismo aspecto y las mismas piezas que la barra de visibilidad de
 * abajo.
 *
 * **Se conserva lo que el cubo hacía bien:** sigue en la esquina donde la busca quien viene de un CAD,
 * resalta la vista puesta y **deja de resaltar en cuanto alguien orbita a mano** —un selector que
 * sigue marcando «Planta» con la cámara torcida estaría mintiendo, que es peor que no marcar nada—.
 *
 * Los iconos son los mismos que tenía el grupo de la cinta: un mandato con dos dibujos obliga a
 * leerlos.
 */
export function SelectorDeVista({
  vista,
  onVista,
  desactivado,
}: {
  /** La última vista aplicada. `null` en cuanto alguien orbita a mano. */
  readonly vista: StandardView | null;
  readonly onVista: (vista: StandardView) => void;
  readonly desactivado: boolean;
}) {
  return (
    <PanelFlotante posicion="arriba-derecha" etiqueta="Vista" apagado={desactivado}>
      <GrupoFlotante rotulo="Vista">
        <BotonFlotante
          icono={<IconViewIso />}
          nombre="Isométrica"
          ayuda="La vista general, en tres cuartos"
          activo={vista === "iso"}
          desactivado={desactivado}
          onClick={() => onVista("iso")}
        />
        <BotonFlotante
          icono={<IconViewTop />}
          nombre="Planta"
          ayuda="Desde arriba, en vertical"
          activo={vista === "top"}
          desactivado={desactivado}
          onClick={() => onVista("top")}
        />
        <BotonFlotante
          icono={<IconViewFront />}
          nombre="Frontal"
          ayuda="Alzado de frente"
          activo={vista === "front"}
          desactivado={desactivado}
          onClick={() => onVista("front")}
        />
        <BotonFlotante
          icono={<IconViewSide />}
          nombre="Lateral"
          ayuda="Alzado desde el costado"
          activo={vista === "side"}
          desactivado={desactivado}
          onClick={() => onVista("side")}
        />
      </GrupoFlotante>
    </PanelFlotante>
  );
}
