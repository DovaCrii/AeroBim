import type { FichaDeNube, InformeDeRefresco, ModoDeColor } from "@aerobim/viewer";

/**
 * La nube de puntos, con su ficha y sus mandos: `F12.1`.
 *
 * ## Por qué existe este archivo
 *
 * La Fase 2 dejó **cargar una nube, calzarla con el modelo y medir la desviación** funcionando y
 * comprobado en un navegador de verdad — y **sin una sola forma de alcanzarlo desde la aplicación**.
 * Todo vivía en `diag.html`, o sea escribiendo una URL de diagnóstico a mano. Esto es la puerta.
 *
 * ## Lo que se enseña antes de nada: la ficha
 *
 * Un levantamiento son gigas y **la cabecera se lee en milisegundos**. Poner delante cuántos puntos
 * trae, qué extensión ocupa y en qué sistema está es lo que permite decir «son 130 millones, entra
 * el 12 %» **antes** de esperar — en vez de dejar a alguien mirando una barra sin saber si acabará.
 *
 * ## Y el aviso del sistema de referencia no es un detalle
 *
 * Una nube que no declara CRS **no se puede cruzar con nada**: ni con el modelo, ni con otra nube,
 * ni con un plano. Hoy eso solo se veía en una línea del diagnóstico. Aquí va donde se ve, porque es
 * la diferencia entre medir una desviación y medir una casualidad.
 */
export function NubesPanel({
  ficha,
  informe,
  puntos,
  color,
  avisoDeColor,
  tamanoDePunto,
  recortada,
  onAbrir,
  onColor,
  onTamano,
  onDensidad,
  onRecorte,
  onEncuadrar,
  onCerrar,
}: {
  /** La cabecera de la nube abierta, o `null` si no hay ninguna. */
  readonly ficha: FichaDeNube | null;
  /** Qué trajo el último refresco: nodos, descartados y por qué. */
  readonly informe: InformeDeRefresco | null;
  /** Cuántos puntos hay en la escena ahora. */
  readonly puntos: number;
  readonly color: ModoDeColor;
  /** Por qué el modo de color pedido no se pudo dar, o `null` si se dio el que se pidió. */
  readonly avisoDeColor: string | null;
  readonly tamanoDePunto: number;
  readonly recortada: boolean;
  readonly onAbrir: () => void;
  readonly onColor: (modo: ModoDeColor) => void;
  readonly onTamano: (px: number) => void;
  readonly onDensidad: (puntosMaximos: number) => void;
  readonly onRecorte: (recortar: boolean) => void;
  readonly onEncuadrar: () => void;
  readonly onCerrar: () => void;
}) {
  if (ficha === null) {
    // **El estado vacío enseña el gesto**, como el resto de los paneles: decir «no hay nada» deja a
    // alguien buscando el botón por la pantalla.
    return (
      <div className="p-3 text-xs text-fg-2">
        <p>
          Ninguna nube abierta. Arrastra un <strong>.copc.laz</strong> aquí, o usa{" "}
          <button
            type="button"
            onClick={onAbrir}
            className="text-accent underline underline-offset-2 hover:text-fg"
          >
            Abrir
          </button>{" "}
          arriba.
        </p>
        <p className="mt-2 text-fg-3">
          Un levantamiento se convierte a COPC fuera de la aplicación — ver{" "}
          <code>docs/NUBES_DE_PUNTOS.md</code>.
        </p>
      </div>
    );
  }

  const cabe = ficha.puntos > 0 ? (puntos / ficha.puntos) * 100 : 0;
  const tamano = ficha.maximo.map((v, i) => v - (ficha.minimo[i] as number));

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      {/* --- La ficha: lo que dice el archivo, leído sin descargar puntos --- */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <Dato nombre="Puntos">
          {puntos.toLocaleString("es-CL")} de {ficha.puntos.toLocaleString("es-CL")}
          {cabe < 99.5 && <span className="text-fg-3"> ({cabe.toFixed(0)} %)</span>}
        </Dato>
        <Dato nombre="Tamaño">{tamano.map((v) => v.toFixed(1)).join(" × ")} m</Dato>
        <Dato nombre="Sistema">
          {ficha.wkt === "" ? (
            // **Sin sistema de referencia la nube no se cruza con nada**, y hay que decirlo donde
            // se ve. Con el dato, el conversor lo escribe dentro del archivo con `--epsg`.
            <span className="text-warn">ninguno — no se puede cruzar con el modelo</span>
          ) : (
            <span className="text-ok">
              declarado{ficha.wkt.includes("32719") ? " · UTM 19S" : ""}
            </span>
          )}
        </Dato>
        {!ficha.hayCubo && (
          <Dato nombre="Octree">
            <span className="text-warn">sin cubo declarado — no hay recorte por vista</span>
          </Dato>
        )}
      </dl>

      {informe !== null && (
        <p className="text-fg-3">
          {informe.nodos} nodos en escena · {informe.fueraDeVista} fuera de vista ·{" "}
          {informe.sinPresupuesto} sin presupuesto
        </p>
      )}

      {/* --- Los mandos de `F2.3`, que existían y no tenían dónde tocarse --- */}
      <Campo etiqueta="Color">
        <select
          value={color}
          onChange={(e) => onColor(e.target.value as ModoDeColor)}
          className="min-h-8 w-full rounded-sm border border-borde-campo bg-surface-2 px-2 text-xs text-fg"
        >
          <option value="altura">Por altura</option>
          <option value="rgb">Color del levantamiento</option>
          <option value="intensidad">Por intensidad</option>
          <option value="clase">Por clasificación</option>
        </select>
      </Campo>
      {/*
       * **Y cuando el modo pedido no sirve, se dice por qué.**
       *
       * El desplegable ya volvía solo a «Por altura» —el visor devuelve el modo que consiguió y
       * aquí se anota ese, no el pedido— y eso era honesto pero mudo: quien pulsa «Por
       * clasificación» sobre un levantamiento sin clases ve que el control rebota y no sabe si el
       * archivo no las trae o si algo falla. El usuario lo describió como «no cargan bien la
       * intensidad y el RGB», mirando una nube que estaba en clasificación.
       */}
      {avisoDeColor !== null && <p className="text-nota text-warn">{avisoDeColor}</p>}

      <Campo etiqueta={`Punto · ${tamanoDePunto} px`}>
        <input
          type="range"
          min={1}
          max={8}
          step={1}
          value={tamanoDePunto}
          onChange={(e) => onTamano(Number(e.target.value))}
          className="w-full accent-[var(--color-action)]"
        />
      </Campo>

      {/* **La densidad es un techo de puntos y no un porcentaje**: lo que limita es la memoria de
          la tarjeta, y un porcentaje de una nube de 15 millones y de una de 300 no son lo mismo. */}
      <Campo etiqueta="Detalle">
        <div className="flex gap-1">
          {(
            [
              ["Ligero", 1_000_000],
              ["Normal", 4_000_000],
              ["Máximo", 12_000_000],
            ] as const
          ).map(([nombre, tope]) => (
            <button
              key={nombre}
              type="button"
              onClick={() => onDensidad(tope)}
              className="min-h-8 flex-1 rounded-sm bg-surface-2 px-2 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg"
            >
              {nombre}
            </button>
          ))}
        </div>
      </Campo>

      <label className="flex min-h-8 items-center gap-2">
        <input
          type="checkbox"
          checked={recortada}
          onChange={(e) => onRecorte(e.target.checked)}
          className="accent-[var(--color-action)]"
        />
        <span className="text-fg-2">Recortar a la zona del modelo</span>
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onEncuadrar}
          className="min-h-9 flex-1 rounded-sm bg-surface-2 text-xs text-fg hover:bg-surface-3"
        >
          Encuadrar
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-9 flex-1 rounded-sm bg-surface-2 text-xs text-fg-2 hover:bg-surface-3 hover:text-danger"
        >
          Cerrar la nube
        </button>
      </div>
    </div>
  );
}

function Dato({
  nombre,
  children,
}: {
  readonly nombre: string;
  readonly children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-fg-3">{nombre}</dt>
      <dd className="text-fg">{children}</dd>
    </>
  );
}

function Campo({
  etiqueta,
  children,
}: {
  readonly etiqueta: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-fg-3">{etiqueta}</span>
      {children}
    </label>
  );
}
