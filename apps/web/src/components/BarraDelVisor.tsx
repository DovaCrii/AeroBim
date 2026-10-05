import { IconEye, IconEyeOff, IconFrameSelection, IconIsolate, IconUnisolate } from "./icons.js";
import { BotonFlotante, GrupoFlotante, PanelFlotante, SeparadorFlotante } from "./PanelFlotante.js";

/**
 * La barra flotante sobre el visor: **Visibilidad** y **Selección** (2026-10-05).
 *
 * Es la idea que se tomó de la barra inferior de That Open Platform, y se toma como idea: las
 * acciones que se repiten treinta veces al día —apagar, aislar, salir, ver todo, encuadrar lo
 * elegido— a un clic del modelo y **sin depender de que la cinta esté abierta**. Con la cinta plegada
 * para dejarle el lienzo al modelo, antes se perdían justo las que más se usan sobre él.
 *
 * **Se movió, no se copió.** Estas acciones vivían en la cinta (grupo «Visibilidad»), en la ficha de
 * la selección y en la barra de estado; una cuarta copia habría empeorado lo que se quería arreglar.
 * Salieron de la cinta, que queda más corta; la ficha y la barra de estado conservan su atajo
 * contextual.
 *
 * Mismas reglas que tenían en la cinta —incluida la de que «Salir» y «Ver todo» son dos botones, y
 * por qué—, mismo tamaño táctil y mismos iconos: un mandato con dos dibujos obliga a leerlos.
 */
export function BarraDelVisor({
  tieneSeleccion,
  seleccionVisible,
  aislado,
  hayOcultos,
  onAlternarSeleccion,
  onAislar,
  onSalirDelAislamiento,
  onVerTodo,
  onEncuadrarSeleccion,
}: {
  readonly tieneSeleccion: boolean;
  /** Si el elemento elegido está encendido: decide si el primer botón dice «Apagar» o «Encender». */
  readonly seleccionVisible: boolean;
  readonly aislado: boolean;
  /** Hay algo apagado: «Ver todo» se resalta, porque tiene algo que hacer. */
  readonly hayOcultos: boolean;
  readonly onAlternarSeleccion: () => void;
  readonly onAislar: () => void;
  readonly onSalirDelAislamiento: () => void;
  readonly onVerTodo: () => void;
  readonly onEncuadrarSeleccion: () => void;
}) {
  return (
    <PanelFlotante posicion="abajo-centro" etiqueta="Visibilidad y selección">
      <GrupoFlotante rotulo="Visibilidad">
        <BotonFlotante
          icono={seleccionVisible ? <IconEyeOff /> : <IconEye />}
          nombre={seleccionVisible ? "Apagar" : "Encender"}
          ayuda={
            tieneSeleccion
              ? "Apaga o enciende el elemento seleccionado. También en su ficha"
              : "Selecciona un elemento primero"
          }
          desactivado={!tieneSeleccion}
          onClick={onAlternarSeleccion}
        />
        <BotonFlotante
          icono={<IconIsolate />}
          nombre="Aislar"
          ayuda={
            tieneSeleccion
              ? "Deja solo el elemento seleccionado a la vista"
              : "Selecciona un elemento primero"
          }
          desactivado={!tieneSeleccion}
          onClick={onAislar}
        />
        {/* «Salir» deshace el aislamiento y devuelve lo de antes —lo apagado a mano sigue
            apagado—; «Ver todo» enciende el modelo entero. Por eso son dos. */}
        <BotonFlotante
          icono={<IconUnisolate />}
          nombre="Salir"
          ayuda={
            aislado
              ? "Sale del aislamiento y vuelve a como estaba el modelo antes de aislar"
              : "No hay ningún aislamiento del que salir"
          }
          resaltado={aislado}
          desactivado={!aislado}
          onClick={onSalirDelAislamiento}
        />
        <BotonFlotante
          icono={<IconEye />}
          nombre="Ver todo"
          ayuda="Enciende todo el modelo, incluido lo que se apagó a mano"
          resaltado={hayOcultos}
          onClick={onVerTodo}
        />
      </GrupoFlotante>

      <SeparadorFlotante />

      <GrupoFlotante rotulo="Selección">
        <BotonFlotante
          icono={<IconFrameSelection />}
          nombre="Encuadrar"
          ayuda={
            tieneSeleccion ? "Lleva la cámara a lo seleccionado" : "Selecciona un elemento primero"
          }
          desactivado={!tieneSeleccion}
          onClick={onEncuadrarSeleccion}
        />
      </GrupoFlotante>
    </PanelFlotante>
  );
}
