import type { DrawnMeasurement, SavedView } from "@aerobim/viewer";
import { Fragment, useEffect, useRef, useState } from "react";
import { Resizer } from "./Resizer.js";
import {
  IconAngle,
  IconArea,
  IconCalce,
  IconChevronDown,
  IconChevronRight,
  IconDistance,
  IconEye,
  IconEyeOff,
  IconLayers,
  IconMeasure,
  IconNota,
  IconNube,
  IconPlan2D,
  IconPlanoSalida,
  IconRegistro,
  IconTable,
  IconTree,
  IconViewIso,
  IconViews,
  IconVistaCompartida,
  IconX,
} from "./icons.js";

/**
 * Los cuatro grupos del navegador, en orden. `F12.5`.
 *
 * **Doce secciones seguidas con la misma cabecera son un muro**, y eso está medido: hasta el
 * 2026-09-08 las doce eran `h2` en mayúsculas, del mismo tamaño, color y peso, todas plegadas. Una
 * lista de doce cosas iguales no es una lista.
 *
 * El grupo **no es un destino**: las cuatro listas están a la vez en la misma columna, porque la
 * razón de que las secciones estén juntas —comparar el plano con el modelo encendiendo y apagando
 * de los dos— se rompería al repartirlas en cuatro sitios. Es un rótulo que separa. La decisión
 * está en `docs/UX.md`, «Derecha: el contenido del proyecto, todo junto».
 */
const GRUPOS = ["Empezar", "Lo abierto", "El modelo", "Lo guardado"] as const;

type Grupo = (typeof GRUPOS)[number];

/**
 * Qué grupos están plegados, guardado entre sesiones.
 *
 * **Y esto sí se recuerda, al contrario que las secciones**, que es una diferencia deliberada: qué
 * sección hace falta depende de lo que se esté haciendo ahora mismo, pero plegar un grupo entero es
 * decir «de esto no me ocupo», y eso dura. Quien deja el navegador a cuatro filas no quiere volver
 * a plegarlo cada vez que recarga.
 */
const CLAVE_GRUPOS = "aerobim.navegador.grupos.v1";

function gruposGuardados(): ReadonlySet<Grupo> {
  try {
    const crudo = globalThis.localStorage?.getItem(CLAVE_GRUPOS);
    if (crudo === null || crudo === undefined) return new Set();
    const leido: unknown = JSON.parse(crudo);
    if (!Array.isArray(leido)) return new Set();
    // Se filtra contra `GRUPOS` y no se confía en lo guardado: un nombre de grupo que ya no existe
    // —porque se renombró— dejaría plegado un grupo fantasma y visible uno que se quiso ocultar.
    return new Set(GRUPOS.filter((grupo) => leido.includes(grupo)));
  } catch {
    // Una ventana privada o el almacenamiento bloqueado: se arranca con todo desplegado, que es el
    // estado que enseña todo. Nunca se cae por esto.
    return new Set();
  }
}

/** Una sección del navegador, tal como se describe una sola vez y se pinta en dos sitios. */
type Descriptor = {
  readonly clave: string;
  readonly titulo: string;
  readonly grupo: Grupo;
  readonly icono: React.ReactNode;
  /**
   * Cuántas cosas hay dentro, o `null` cuando esta columna **no puede saberlo**.
   *
   * `null` no es cero y la diferencia importa: el selector del registro, la coordinación, los
   * cuadros y las vistas del proyecto piden sus datos al servidor por su cuenta, así que aquí no hay
   * cifra que enseñar. Se pinta en tono neutro, sin cifra y sin decir «vacío» — inventar un cero
   * sería peor que no decir nada.
   */
  readonly cuantos: number | null;
  /**
   * `true` si esta sección se despliega sola al pasar de vacía a llena.
   *
   * **No la llevan todas las que tienen cifra**, y por eso es una bandera y no una consecuencia: al
   * cargar un modelo se llenan «Modelos abiertos» y «Estructura del modelo» a la vez, y abrir las
   * dos deja la columna con dos listas apretadas a su alto mínimo. Se abre **la que se va a mirar**
   * —la estructura— y la otra se queda con su cifra, que ya contesta lo que tenía que contestar.
   */
  readonly abreAlLlenarse: boolean;
  readonly contenido: React.ReactNode;
};

/**
 * El navegador del proyecto: qué hay abierto y qué se ha medido.
 *
 * **Es el panel de la derecha, como en Revit.** Reúne en un solo sitio las tres listas que se
 * consultan mientras se revisa —la estructura del modelo, los modelos abiertos y las cotas
 * dibujadas— cada una plegable, porque nunca se necesitan las tres a la vez.
 *
 * El contenido llega como nodos y no lo construye este componente: el árbol y el panel de modelos ya
 * existen y saben lo suyo. Acá se decide **el reparto del espacio**, que es el problema propio de un
 * panel con varias secciones.
 */
export function ProjectBrowser({
  registro,
  coordinacion,
  estructura,
  cuadros,
  modelos,
  modelCount,
  nubes,
  hayNube,
  calce,
  planos,
  planCount,
  generados,
  drawingCount,
  cotas,
  vistas,
  vistasDelProyecto,
  puedeGuardarVista,
  onToggleMeasurement,
  onDeleteMeasurement,
  onSaveView,
  onApplyView,
  onDeleteView,
  pedida = null,
  plegado = false,
  ocultas = [],
  onDesplegarEn,
}: {
  /**
   * Secciones que **no existen** en esta sesión, por su clave.
   *
   * Lo usa el visor abierto desde un enlace compartido: quien entra así no tiene cuenta, así que
   * «Del registro», «Coordinación» y las vistas guardadas de la obra no pueden traer nada — sus
   * peticiones responderían 401.
   *
   * **Se ocultan y no se deshabilitan**, y es la diferencia que importa: una sección gris que no
   * se abre le dice a alguien de fuera que hay algo ahí que no le dejan ver, y eso es contarle la
   * forma del producto a quien solo vino a mirar un modelo. Una que no está, no cuenta nada.
   */
  readonly ocultas?: readonly string[];
  /** Lo que el registro documental ofrece abrir, agrupado por obra. */
  readonly registro: React.ReactNode;
  /** Las observaciones del modelo, con el clic que lleva al problema. */
  readonly coordinacion: React.ReactNode;
  readonly estructura: React.ReactNode;
  /** Los cuadros por categoría: qué hay en el modelo y cuántas hay. */
  readonly cuadros: React.ReactNode;
  readonly modelos: React.ReactNode;
  /** Cuántos modelos IFC hay abiertos. Alimenta la cifra de «Modelos abiertos» y de «Estructura». */
  readonly modelCount: number;
  /** La nube de puntos: su ficha y sus mandos (`F12.1`). */
  readonly nubes: React.ReactNode;
  /** `true` con un levantamiento cargado. Es una o ninguna, así que no lleva cifra sino presencia. */
  readonly hayNube: boolean;
  /** Calzar la nube con el modelo y medir lo que se aparta (`F12.2`). */
  readonly calce: React.ReactNode;
  /** Los planos 2D cargados, con sus capas y su ajuste. */
  readonly planos: React.ReactNode;
  readonly planCount: number;
  /** Los planos generados desde el modelo, con su exportación. */
  readonly generados: React.ReactNode;
  readonly drawingCount: number;
  /**
   * Las cotas dibujadas.
   *
   * **La sección ya no aparece y desaparece con ellas**, que es lo que hacía antes: ahora está
   * siempre, dice «vacío» cuando no hay ninguna y **se abre sola** en cuanto se toma la primera.
   * Una sección que va y viene obliga a buscarla dos veces; una que se abre al llenarse la pone
   * delante justo cuando hace falta.
   */
  readonly cotas: readonly DrawnMeasurement[];
  /** Las vistas guardadas **en este navegador**, en el orden en que se guardaron. */
  readonly vistas: readonly SavedView[];
  /** Las que sí se le pueden pasar a otra persona: viven en el registro y se piden por proyecto. */
  readonly vistasDelProyecto: React.ReactNode;
  /** `false` sin modelo abierto: no hay vista que guardar. */
  readonly puedeGuardarVista: boolean;
  readonly onToggleMeasurement: (id: string, visible: boolean) => void;
  readonly onDeleteMeasurement: (id: string) => void;
  readonly onSaveView: (name: string) => void;
  readonly onApplyView: (view: SavedView) => void;
  readonly onDeleteView: (id: string) => void;
  /**
   * Una sección que alguien pide desde fuera, para que se despliegue sola.
   *
   * **Lleva un `sello` y no solo la clave**, y es lo que hace que funcione la segunda vez: pedir
   * «registro», plegarla a mano y volver a pedir «registro» tiene que abrirla otra vez, y con solo
   * la clave el valor de la propiedad no habría cambiado y no pasaría nada. El sello es un número
   * que sube en cada petición.
   *
   * Solo **abre**: nunca pliega lo que ya estaba abierto, porque quien pide una sección quiere
   * llegar a ella, no reorganizarle el panel a nadie.
   */
  readonly pedida?: { readonly clave: string; readonly sello: number } | null;
  /**
   * `true` para dibujar el rail: los doce iconos en 44 px, sin rótulos ni listas.
   *
   * **Es el mismo navegador con los rótulos escondidos**, no un menú aparte, y por eso lo pinta
   * este componente y no otro: sale del mismo `SECCIONES`, así que una capacidad nueva aparece en
   * los dos sitios por añadir una fila. Si fueran dos listas, la segunda se quedaría atrás.
   */
  readonly plegado?: boolean;
  /** Despliega el navegador con esa sección abierta. Es lo que hace un clic en el rail. */
  readonly onDesplegarEn?: (clave: string) => void;
}) {
  /**
   * Qué secciones están desplegadas. **Todas arrancan plegadas.**
   *
   * Antes arrancaban abiertas casi todas, y con siete secciones eso llena la columna entera de
   * listas vacías —«Ninguno», «Ninguna todavía»— que empujan hacia abajo la única que se está
   * usando. Plegadas, la columna cabe de un vistazo y **se abre lo que se necesita**, que es lo que
   * pidió el usuario con esas palabras.
   *
   * No se recuerda entre sesiones a propósito: qué sección hace falta depende de lo que se esté
   * haciendo ahora, no de lo que se hacía ayer.
   */
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  /**
   * Los grupos plegados. Ver {@link CLAVE_GRUPOS}.
   *
   * **Es lo que pidió el usuario mirando la columna:** «poder colapsar también la sección Empezar,
   * Lo abierto, para disminuir y tener todo con mayor facilidad… que ese panel aproveche el espacio
   * y no se vea tan lleno». Con los cuatro plegados el navegador ocupa cuatro filas y sigue
   * diciendo qué hay dentro de cada una, que es la parte que no se puede perder: el rótulo lleva la
   * cuenta, así que plegar no es esconder.
   */
  const [gruposPlegados, setGruposPlegados] = useState<ReadonlySet<Grupo>>(gruposGuardados);
  /**
   * El alto que se le fijó a mano a cada sección, en píxeles.
   *
   * Las que no están aquí se reparten lo que sobre, que es lo que hacían todas antes. Fijar una
   * sección es lo que permite, por ejemplo, dejar las capas de un plano grandes mientras el árbol
   * se queda en dos líneas — y al revés diez minutos después.
   */
  const [altos, setAltos] = useState<Readonly<Record<string, number>>>({});

  // La sección que se pide desde fuera —hoy «Del registro» desde la puerta de entrada— se despliega
  // sola. Depende del sello y no de la clave: ver la propiedad `pedida`.
  const sello = pedida?.sello ?? null;
  const clavePedida = pedida?.clave ?? null;
  useEffect(() => {
    if (sello === null || clavePedida === null) return;
    setAbiertas((actual) => (actual.has(clavePedida) ? actual : new Set(actual).add(clavePedida)));
  }, [sello, clavePedida]);

  const alternar = (clave: string) =>
    setAbiertas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });

  /**
   * Pliega o despliega un grupo entero.
   *
   * **Al plegarlo se cierran sus secciones**, y no es limpieza: es lo que hace que plegar un grupo
   * se note. Un grupo con una sección abierta dentro se dibuja desplegado a propósito —ver la regla
   * de `plegadoElGrupo`, que es la que deja que «se abre sola la que acaba de llenarse» siga
   * funcionando con el grupo plegado—, así que sin cerrarlas, pulsar el rótulo no haría nada
   * visible y parecería roto.
   */
  const alternarGrupo = (grupo: Grupo) => {
    // **De dónde sale cada cosa importa.** `plegando` se decide con lo que la persona tenía
    // delante al pulsar —el valor del render—, pero el conjunto nuevo se calcula sobre `actual`,
    // el anterior de React. Calcularlo también desde el render fue el primer intento y estaba mal:
    // dos pulsaciones en el mismo turno parten las dos del mismo conjunto y la segunda pisa a la
    // primera. Medido plegando los cuatro grupos de una vez: se plegó **solo el último**.
    const plegando = !gruposPlegados.has(grupo);
    setGruposPlegados((actual) => {
      const siguiente = new Set(actual);
      if (plegando) siguiente.add(grupo);
      else siguiente.delete(grupo);
      try {
        globalThis.localStorage?.setItem(CLAVE_GRUPOS, JSON.stringify([...siguiente]));
      } catch {
        // Guardar es una comodidad, no el estado: si no se puede, la sesión sigue igual.
      }
      return siguiente;
    });
    if (!plegando) return;
    const suyas = SECCIONES.filter((una) => una.grupo === grupo).map((una) => una.clave);
    setAbiertas((actual) => new Set([...actual].filter((clave) => !suyas.includes(clave))));
  };

  /** Mueve el borde inferior de una sección. El alto de partida es el que tiene en pantalla. */
  const redimensionar = (clave: string, delta: number, actualEnPantalla: number) =>
    setAltos((actuales) => ({
      ...actuales,
      [clave]: Math.max(ALTO_MINIMO, (actuales[clave] ?? actualEnPantalla) + delta),
    }));

  /**
   * Las doce secciones, descritas **una sola vez**.
   *
   * Era doce bloques `<Seccion>` escritos a mano con la misma llamada repetida, y el precio no era
   * la repetición: era que **añadir una capacidad significaba escribir el mismo bloque otra vez** y
   * que no había forma de pintar la misma lista en dos sitios. Con el descriptor, añadir una
   * capacidad sigue siendo lo que `docs/UX.md` promete —añadir una fila— y el rail plegado puede
   * leer exactamente lo mismo que el acordeón.
   *
   * El orden dentro de cada grupo es el de trabajo, y los comentarios de por qué cada una está
   * donde está siguen aquí porque son decisiones, no adorno.
   */
  const TODAS: readonly Descriptor[] = [
    // **Del registro va primero porque es de donde se parte.** Hasta `F12.1` la única forma de
    // abrir una revisión era entrar desde su expediente: la API del selector existía desde `F8.8` y
    // no la consumía nadie.
    {
      clave: "registro",
      titulo: "Del registro",
      grupo: "Empezar",
      icono: <IconRegistro />,
      cuantos: null,
      abreAlLlenarse: false,
      contenido: registro,
    },
    // **La coordinación va junto al registro y antes del árbol.** Es de donde se parte cuando se
    // abre el modelo para revisar: primero qué hay que mirar, después el modelo.
    {
      clave: "coordinacion",
      titulo: "Coordinación",
      grupo: "Empezar",
      icono: <IconNota />,
      cuantos: null,
      abreAlLlenarse: false,
      contenido: coordinacion,
    },
    {
      clave: "modelos",
      titulo: "Modelos abiertos",
      grupo: "Lo abierto",
      icono: <IconLayers />,
      cuantos: modelCount,
      abreAlLlenarse: false,
      contenido: modelos,
    },
    // **Los planos 2D van junto a los modelos, no en otra pestaña.** Son otra fuente del mismo
    // proyecto, y la comparación entre el plano y el modelo se hace encendiendo y apagando de los
    // dos: un solo gesto si están a la misma altura.
    {
      clave: "planos",
      titulo: "Planos 2D",
      grupo: "Lo abierto",
      icono: <IconPlan2D />,
      cuantos: planCount,
      abreAlLlenarse: true,
      contenido: planos,
    },
    // **La nube va junto a los modelos abiertos y no al final**, porque es lo mismo: otra fuente del
    // proyecto que está abierta ahora. Es la primera capacidad que estrenó la regla de crecimiento.
    {
      clave: "nubes",
      titulo: "Nube de puntos",
      grupo: "Lo abierto",
      icono: <IconNube />,
      cuantos: hayNube ? 1 : 0,
      abreAlLlenarse: true,
      contenido: nubes,
    },
    // **El calce va justo debajo de la nube y no en Coordinación**, aunque acabe en una observación:
    // es lo que se hace *con* la nube y antes de poder medir nada.
    {
      clave: "calce",
      titulo: "Calce y desviación",
      grupo: "Lo abierto",
      icono: <IconCalce />,
      cuantos: null,
      abreAlLlenarse: false,
      contenido: calce,
    },
    {
      clave: "estructura",
      titulo: "Estructura del modelo",
      grupo: "El modelo",
      icono: <IconTree />,
      cuantos: modelCount,
      abreAlLlenarse: true,
      contenido: estructura,
    },
    // **Los cuadros van junto a la estructura, no con los planos.** El árbol dice **dónde** está
    // cada cosa y el cuadro dice **qué es y cuántas hay**: son las dos preguntas que uno se hace
    // mirando el modelo. Exportar es lo que se hace después, no lo que las emparenta.
    {
      clave: "cuadros",
      titulo: "Cuadros del modelo",
      grupo: "El modelo",
      icono: <IconTable />,
      cuantos: null,
      abreAlLlenarse: false,
      contenido: cuadros,
    },
    // Los planos que **salen** del modelo, en el grupo del modelo y no con los que **entran**: es
    // la única pareja del navegador que se separó al agrupar, y se separó por eso.
    {
      clave: "generados",
      titulo: "Planos generados",
      grupo: "El modelo",
      icono: <IconPlanoSalida />,
      cuantos: drawingCount,
      abreAlLlenarse: true,
      contenido: generados,
    },
    {
      clave: "vistas",
      titulo: "Vistas guardadas",
      grupo: "Lo guardado",
      icono: <IconViews />,
      cuantos: vistas.length,
      abreAlLlenarse: false,
      contenido: (
        <Vistas
          vistas={vistas}
          puedeGuardar={puedeGuardarVista}
          onGuardar={onSaveView}
          onAplicar={onApplyView}
          onBorrar={onDeleteView}
        />
      ),
    },
    // **Las del proyecto van justo debajo de las locales**, y las dos existen a propósito: una
    // vista local es de trabajo y no cuesta nada —ni viaje al servidor ni permiso—; una compartida
    // es un acto explícito. Puestas juntas, la diferencia se lee sin explicarla.
    {
      clave: "vistas-proyecto",
      titulo: "Vistas del proyecto",
      grupo: "Lo guardado",
      icono: <IconVistaCompartida />,
      cuantos: null,
      abreAlLlenarse: false,
      contenido: vistasDelProyecto,
    },
    // "Cotas dibujadas" era jerga y decía menos de lo que la lista hace: acá están las mediciones
    // tomadas, con su valor, y se apagan o se borran una por una.
    {
      clave: "cotas",
      titulo: "Mediciones tomadas",
      grupo: "Lo guardado",
      icono: <IconMeasure />,
      cuantos: cotas.length,
      abreAlLlenarse: true,
      contenido: (
        <ul className="p-1">
          {cotas.map((cota) => (
            <CotaEnLista
              key={cota.id}
              cota={cota}
              onToggle={onToggleMeasurement}
              onDelete={onDeleteMeasurement}
            />
          ))}
        </ul>
      ),
    },
  ];

  // **El filtro va aparte y no encadenado al literal**, y no es estilo: encadenarlo le quita al
  // array el tipo que lo anota, así que `grupo` pasa de ser una de las cuatro palabras a ser
  // `string` y el build falla con un error que habla de otra cosa.
  const SECCIONES: readonly Descriptor[] = TODAS.filter((una) => !ocultas.includes(una.clave));

  /**
   * **Se abre sola la sección que acaba de llenarse.**
   *
   * Sustituye a «todas plegadas» sin traicionar su motivo. El motivo era no llenar la columna de
   * listas vacías que empujan hacia abajo la que se está usando; abrir la que **deja** de estar
   * vacía no hace eso — llega un modelo y se abre Estructura, llega un levantamiento y se abre Nube.
   * Es lo que se iba a hacer a mano un segundo después.
   *
   * Solo en el salto de cero a algo, y por eso hace falta guardar la cuenta anterior. Al montar no
   * abre nada: se siembra con lo que hay, así que abrir el visor con un modelo ya cargado —volver
   * de otra pestaña— no reorganiza la columna.
   */
  const cuentaAnterior = useRef<Record<string, number> | null>(null);
  const cuentas = Object.fromEntries(
    SECCIONES.filter((una) => una.cuantos !== null && una.abreAlLlenarse).map((una) => [
      una.clave,
      una.cuantos as number,
    ]),
  );
  const huella = JSON.stringify(cuentas);
  useEffect(() => {
    const antes = cuentaAnterior.current;
    cuentaAnterior.current = cuentas;
    if (antes === null) return;
    const recienLlenas = Object.keys(cuentas).filter(
      (clave) => (antes[clave] ?? 0) === 0 && (cuentas[clave] ?? 0) > 0,
    );
    if (recienLlenas.length === 0) return;
    setAbiertas((actual) => {
      const siguiente = new Set(actual);
      for (const clave of recienLlenas) siguiente.add(clave);
      return siguiente;
    });
    // `cuentas` es un objeto nuevo en cada render, así que la dependencia es su huella: sin eso el
    // efecto correría en todos los renders y volvería a abrir lo que alguien acaba de plegar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huella]);

  if (plegado)
    return (
      <nav
        aria-label="Secciones del proyecto"
        className="flex h-full flex-col overflow-y-auto py-1"
      >
        {/* **Se filtran los grupos vacíos antes de numerarlos**, y el orden importa: con el
            `indice` del array completo, un grupo oculto dejaría su raya separadora colgando sin
            nada a un lado. Pasa con un enlace compartido, donde «Empezar» se queda sin secciones. */}
        {GRUPOS.filter((grupo) => SECCIONES.some((una) => una.grupo === grupo)).map(
          (grupo, indice) => (
            <Fragment key={grupo}>
              {/* Una raya en vez del rótulo: plegado no hay sitio para la palabra, y el grupo sigue
                siendo información — dice que lo de arriba y lo de abajo son cosas distintas. */}
              {indice > 0 && <hr className="mx-2 my-1 border-borde" />}
              {SECCIONES.filter((una) => una.grupo === grupo).map((una) => (
                <button
                  key={una.clave}
                  type="button"
                  onClick={() => onDesplegarEn?.(una.clave)}
                  // **El nombre va en `aria-label` y en `title`, nunca solo en `title`.** Un `title`
                  // no existe para el teclado ni en táctil, y un rail de doce iconos sin nombre es
                  // el problema que la cinta con rótulos vino a resolver.
                  aria-label={
                    una.cuantos === null
                      ? una.titulo
                      : una.cuantos === 0
                        ? `${una.titulo} — vacío`
                        : `${una.titulo} — ${una.cuantos}`
                  }
                  title={`${una.titulo} — clic para desplegar el navegador aquí`}
                  className={[
                    "relative mx-auto flex min-h-11 w-11 items-center justify-center rounded-sm",
                    "transition-colors duration-[--duracion-corta] ease-[--ease-ab]",
                    "[&>svg]:h-4 [&>svg]:w-4",
                    una.cuantos === 0
                      ? "text-apagado-fg hover:bg-surface-3 hover:text-fg-2"
                      : "text-fg-2 hover:bg-surface-3 hover:text-fg",
                  ].join(" ")}
                >
                  {una.icono}
                  {/* **El punto es la cifra que aquí no cabe.** Sin él, el rail no distingue una
                    sección con tres modelos de una vacía, y entonces plegar cuesta información en
                    vez de solo sitio. Va con el color de acento, que sí se lee sobre el panel. */}
                  {una.cuantos !== null && una.cuantos > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent"
                    />
                  )}
                </button>
              ))}
            </Fragment>
          ),
        )}
      </nav>
    );

  return (
    /*
     * **`overflow-y-auto` es nuevo y hace falta.** Doce cabeceras plegadas más los cuatro rótulos
     * de grupo no caben en una pantalla baja, y sin desplazamiento la última sección quedaba
     * cortada sin aviso: el contenedor no tenía `overflow`, así que simplemente se salía.
     *
     * Convive con el reparto del alto porque las plegadas son `shrink-0` —no pueden encogerse, así
     * que desbordan y aparece la barra— mientras la abierta sigue tomando lo que sobra.
     */
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {GRUPOS.map((grupo) => {
        const suyas = SECCIONES.filter((una) => una.grupo === grupo);
        /**
         * **Un grupo sin ninguna sección no se dibuja.**
         *
         * Pasa entrando por un enlace compartido, donde «Del registro» y «Coordinación» se ocultan
         * y el grupo «Empezar» se queda sin nada dentro. Se vio en la pantalla: un rótulo suelto
         * sobre una raya, que quien viene de fuera lee como algo que falta por cargar.
         */
        if (suyas.length === 0) return null;
        /**
         * **Un grupo con una sección abierta se dibuja desplegado**, aunque esté marcado como
         * plegado. Es la regla que deja convivir las dos cosas: plegar un grupo dura entre
         * sesiones, y «se abre sola la sección que acaba de llenarse» tiene que seguir enseñando
         * lo que acaba de llegar. Sin esto, con «El modelo» plegado, abrir un IFC no se vería.
         */
        const conAbierta = suyas.some((una) => abiertas.has(una.clave));
        const plegadoElGrupo = gruposPlegados.has(grupo) && !conAbierta;
        /**
         * Lo que hay dentro, sumado. **Es lo que hace que plegar no sea esconder**: el rótulo
         * plegado sigue diciendo «Lo abierto · 2», así que se sabe si hace falta abrirlo sin
         * abrirlo. Las secciones que no cuentan nada —«Del registro», «Coordinación»— no suman:
         * no tienen cuántos, tienen un botón.
         */
        const dentro = suyas.reduce((suma, una) => suma + (una.cuantos ?? 0), 0);
        return (
          <Fragment key={grupo}>
            {/*
             * **El rótulo del grupo es un botón desde el 2026-09-09**, y antes decía aquí que no
             * lo era. Lo pidió el usuario mirando la columna llena: doce secciones más cuatro
             * rótulos ocupan la altura entera de una pantalla baja, y lo que se está usando queda
             * empujado. Con los cuatro plegados el navegador son cuatro filas.
             *
             * Sigue sin ser un destino: pliega su trozo de la misma columna, no lleva a otra
             * pantalla. Y sigue siendo un `h2` con las secciones como `h3`, que es lo que hace que
             * un lector de pantalla anuncie la jerarquía que el ojo ve.
             */}
            <h2 className="shrink-0">
              {/* `min-h-6` son los 24 px que pide la norma para un área de toque (WCAG 2.5.8);
                  como rótulo costaba 20 y ahora que se pulsa no puede quedarse ahí. */}
              <button
                type="button"
                onClick={() => alternarGrupo(grupo)}
                aria-expanded={!plegadoElGrupo}
                className="flex min-h-6 w-full items-center gap-1 bg-shell px-2 text-micro font-semibold tracking-wider text-fg-3 uppercase hover:text-fg-2"
              >
                {/* Los dos iconos y no uno girado, que es lo que hacen ya las secciones: el
                    navegador tiene que decir lo mismo con la misma forma en sus dos niveles. */}
                {plegadoElGrupo ? (
                  <IconChevronRight className="h-3 w-3 shrink-0" />
                ) : (
                  <IconChevronDown className="h-3 w-3 shrink-0" />
                )}
                <span className="flex-1 text-left">{grupo}</span>
                {/* La cuenta solo cuando hay algo: un «· 0» en cada rótulo sería ruido en los
                    cuatro, y lo que se quiere saber es si merece la pena abrirlo. */}
                {dentro > 0 && <span className="tabular-nums">{dentro}</span>}
              </button>
            </h2>
            {!plegadoElGrupo &&
              suyas.map((una) => (
                <Seccion
                  key={una.clave}
                  titulo={una.titulo}
                  icono={una.icono}
                  cuantos={una.cuantos}
                  abierta={abiertas.has(una.clave)}
                  onAlternar={() => alternar(una.clave)}
                  alto={altos[una.clave] ?? null}
                  onRedimensionar={(delta, actual) => redimensionar(una.clave, delta, actual)}
                >
                  {una.contenido}
                </Seccion>
              ))}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Las vistas guardadas: guardar la actual, volver a una, borrarla.
 *
 * **Una vista guarda desde dónde se mira, qué está apagado y por dónde está cortado.** Es lo que hace
 * falta para volver mañana a lo mismo, y para que dos personas mirando el mismo modelo estén mirando
 * de verdad lo mismo. Con solo la cámara, la vista del otro muestra otra cosa.
 *
 * Se guardan **en este navegador**, no en un servidor: la Fase 3 les dará un sitio compartido. Hasta
 * entonces sobreviven a recargar la página y no salen del equipo, lo que se dice en el pie de la
 * sección para que nadie cuente con más de lo que hay.
 */
function Vistas({
  vistas,
  puedeGuardar,
  onGuardar,
  onAplicar,
  onBorrar,
}: {
  readonly vistas: readonly SavedView[];
  readonly puedeGuardar: boolean;
  readonly onGuardar: (name: string) => void;
  readonly onAplicar: (view: SavedView) => void;
  readonly onBorrar: (id: string) => void;
}) {
  const [nombre, setNombre] = useState("");

  const guardar = () => {
    const limpio = nombre.trim();
    if (limpio === "") return;
    onGuardar(limpio);
    setNombre("");
  };

  return (
    <div className="p-1.5">
      <form
        className="flex gap-1"
        onSubmit={(evento) => {
          evento.preventDefault();
          guardar();
        }}
      >
        <input
          type="text"
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          placeholder="Nombre de la vista"
          disabled={!puedeGuardar}
          className="min-w-0 flex-1 rounded-sm border border-borde bg-surface-3 px-2 py-1 text-xs text-fg placeholder:text-fg-3 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!puedeGuardar || nombre.trim() === ""}
          className="shrink-0 rounded-sm bg-action px-2 py-1 text-xs font-medium text-sobre-accion hover:bg-action-hover disabled:bg-apagado disabled:text-apagado-fg"
          title={
            puedeGuardar
              ? "Guarda la cámara, lo que está apagado y los cortes puestos"
              : "Abre un modelo primero"
          }
        >
          Guardar
        </button>
      </form>

      {vistas.length === 0 ? (
        <p className="px-1 pt-2 text-nota leading-snug text-fg-3">
          Ninguna todavía. Una vista guarda la cámara, lo que está apagado y los cortes, y vuelve
          con un clic.
        </p>
      ) : (
        <ul className="pt-1.5">
          {vistas.map((vista) => (
            <li
              key={vista.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2"
            >
              <span className="shrink-0 text-fg-3">
                <IconViewIso className="h-4 w-4" />
              </span>
              <button
                type="button"
                onClick={() => onAplicar(vista)}
                className="min-w-0 flex-1 truncate text-left text-xs text-fg-2 hover:text-fg"
                title={`Volver a "${vista.name}" — guardada el ${new Date(vista.savedAt).toLocaleString("es-CL")}${
                  vista.sections.length > 0 ? ` · ${vista.sections.length} corte(s)` : ""
                }`}
              >
                {vista.name}
              </button>
              <button
                type="button"
                onClick={() => onBorrar(vista.id)}
                className="shrink-0 text-fg-3 hover:text-danger"
                title="Borrar esta vista"
                aria-label="Borrar esta vista"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="px-1 pt-2 text-nota leading-snug text-fg-3">
        Se guardan en este navegador y no salen del equipo. Para pasarle una a alguien, usa{" "}
        <span className="text-fg-3">Vistas del proyecto</span>.
      </p>
    </div>
  );
}

/** Lo mínimo que puede medir una sección: por debajo no cabe ni una fila. */
const ALTO_MINIMO = 56;

/**
 * Una sección plegable del navegador.
 *
 * Abierta toma su parte del alto disponible y hace su propio desplazamiento; plegada ocupa solo su
 * cabecera. Así tres listas largas conviven sin que ninguna empuje a las otras fuera de la pantalla.
 */
function Seccion({
  titulo,
  icono,
  cuantos = null,
  abierta,
  onAlternar,
  alto,
  onRedimensionar,
  children,
}: {
  readonly titulo: string;
  /** El icono de 16 px a la izquierda del nombre. */
  readonly icono?: React.ReactNode;
  /**
   * Cuántas cosas hay dentro, o `null` cuando no se puede saber desde aquí.
   *
   * **Es lo que da la jerarquía, y la da el estado real y no una lista fija de importancia.** Con
   * contenido, la sección se pinta en el tono del texto principal; vacía, en el apagado y con la
   * palabra «vacío» al lado. Así lo que destaca en la columna es lo que hay abierto ahora, que
   * cambia cada diez minutos, y no lo que alguien decidió que era importante en general.
   */
  readonly cuantos?: number | null;
  readonly abierta: boolean;
  readonly onAlternar: () => void;
  /** Alto fijado a mano, o `null` para repartirse lo que sobra con las demás. */
  readonly alto?: number | null;
  /** Llega el incremento del arrastre y el alto que la sección tenía en pantalla. */
  readonly onRedimensionar?: (delta: number, altoActual: number) => void;
  readonly children: React.ReactNode;
}) {
  const propia = useRef<HTMLElement | null>(null);
  const vacia = cuantos === 0;
  /**
   * Tres tonos y no dos, porque hay tres estados y el tercero no se puede fingir.
   *
   * Con contenido, el texto principal: es lo que hay abierto ahora y lo que tiene que destacar.
   * Vacía, el apagado. Y **sin cifra** —`null`, o sea que esta columna no puede saber cuántas
   * hay— el tono intermedio: pintarla como una llena diría «aquí hay algo» sin haberlo comprobado.
   */
  const tono = cuantos === null ? "text-fg-2" : vacia ? "text-fg-3" : "text-fg";

  return (
    <section
      ref={propia}
      // Con alto fijado la sección no se estira ni se encoge; sin él se reparte el hueco, que es
      // como se comportaban todas antes de poder arrastrarlas.
      style={abierta && alto != null ? { height: alto, flex: "none" } : undefined}
      className={[
        "flex min-h-0 flex-col border-b border-borde",
        // **El `min-h` de la abierta es un arreglo, no un adorno.** Con `flex-1` y `min-h-0` una
        // sección abierta se puede encoger hasta cero, y con doce cabeceras y cuatro rótulos de
        // grupo pidiendo más alto del que hay, eso es exactamente lo que pasaba: la sección se
        // quedaba en 25,8 px —menos que su propia cabecera de 32— y el nombre se dibujaba **encima**
        // de la lista de al lado. Se vio en pantalla, no en una prueba.
        abierta && alto == null ? "min-h-14 flex-1" : "shrink-0",
      ].join(" ")}
    >
      {/*
       * **La cabecera, en caja de frase y con su icono y su cifra.**
       *
       * Antes eran doce `h2` en mayúsculas, del mismo tamaño, color y peso: un muro. Las mayúsculas
       * no eran adorno, hacían daño — se leen más despacio y quitan la única señal de forma que
       * tiene una palabra, su altura. Ahora el nombre va como se escribe, el icono da el
       * reconocimiento sin leer, y la cifra a la derecha contesta «¿hay algo aquí?» sin abrirla.
       *
       * `min-h-8` son 32 px, que es lo que doce cabeceras pueden costar en una columna que también
       * tiene que enseñar listas.
       */}
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        className="flex min-h-8 shrink-0 items-center gap-1.5 px-2 py-1 text-left hover:bg-surface-2"
      >
        <span className="shrink-0 text-fg-3">
          {abierta ? (
            <IconChevronDown className="h-3.5 w-3.5" />
          ) : (
            <IconChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        {icono !== undefined && (
          <span
            className={[
              // `h-4` son **17,6 px y no 16**, porque `--spacing` de este proyecto vale 0,275rem
              // en vez de 0,25 —lo dejó `F9.2` al quitar el `font-size: 110%` de la raíz sin
              // apretar la escala—. Se deja en la unidad de la escala: escribir `h-[16px]` para
              // que cuadre con un documento sería salirse de la escala por un decimal.
              "shrink-0 [&>svg]:h-4 [&>svg]:w-4",
              vacia ? "text-apagado-fg" : "text-fg-3",
            ].join(" ")}
          >
            {icono}
          </span>
        )}
        <h3 className={["min-w-0 flex-1 truncate text-xs font-medium", tono].join(" ")}>
          {titulo}
        </h3>
        {/* La cifra a la derecha, o la palabra cuando no hay nada. `null` no dibuja ninguna de las
            dos: es «no se puede saber desde aquí», que no es lo mismo que cero. */}
        {cuantos !== null && (
          <span
            className={["shrink-0 text-nota tabular-nums", vacia ? "text-fg-3" : "text-fg-2"].join(
              " ",
            )}
          >
            {vacia ? "vacío" : cuantos}
          </span>
        )}
      </button>

      {abierta && <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto">{children}</div>}

      {abierta && onRedimensionar !== undefined && (
        <Resizer
          orientacion="horizontal"
          ayuda={`Arrastra para cambiar el alto de "${titulo}"`}
          onArrastrar={(delta) =>
            onRedimensionar(delta, propia.current?.getBoundingClientRect().height ?? 0)
          }
        />
      )}
    </section>
  );
}

/**
 * Una cota de la lista: su valor, el interruptor para apagarla y el botón para borrarla.
 *
 * **Apagar y borrar son cosas distintas.** Una cota apagada sigue existiendo y vuelve con un clic;
 * borrada hay que medirla otra vez. Con diez cotas encima del modelo, apagar es lo que se usa.
 */
function CotaEnLista({
  cota,
  onToggle,
  onDelete,
}: {
  readonly cota: DrawnMeasurement;
  readonly onToggle: (id: string, visible: boolean) => void;
  readonly onDelete: (id: string) => void;
}) {
  const icono =
    cota.kind === "distance" ? (
      <IconDistance className="h-3.5 w-3.5" />
    ) : cota.kind === "angle" ? (
      <IconAngle className="h-3.5 w-3.5" />
    ) : (
      <IconArea className="h-3.5 w-3.5" />
    );

  return (
    <li className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2">
      <button
        type="button"
        onClick={() => onToggle(cota.id, !cota.visible)}
        className={cota.visible ? "text-accent" : "text-fg-3 hover:text-fg-2"}
        title={cota.visible ? "Apagar esta medición" : "Encender esta medición"}
        aria-label={cota.visible ? "Apagar esta medición" : "Encender esta medición"}
        aria-pressed={cota.visible}
      >
        {cota.visible ? <IconEye className="h-4 w-4" /> : <IconEyeOff className="h-4 w-4" />}
      </button>

      <span className={cota.visible ? "text-fg-3" : "text-apagado-fg"}>{icono}</span>

      <span
        className={[
          "min-w-0 flex-1 truncate font-mono text-xs",
          cota.visible ? "text-fg" : "text-fg-3 line-through",
        ].join(" ")}
      >
        {cota.label}
      </span>

      <button
        type="button"
        onClick={() => onDelete(cota.id)}
        className="text-fg-3 hover:text-danger"
        title="Borrar esta medición"
        aria-label="Borrar esta medición"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
