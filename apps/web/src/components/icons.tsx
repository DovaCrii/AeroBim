/**
 * Iconos de la barra de herramientas, dibujados a mano.
 *
 * **Por qué no una librería de iconos.** Ninguna trae lo que hace falta acá: un corte
 * horizontal, un corte longitudinal y una vista fantasma no son iconos de interfaz genérica,
 * son de software de modelado, y con los genéricos vuelve el problema original —herramientas
 * que no se distinguen entre sí—. Estos son pocos, pesan nada y se pueden ajustar hasta que se
 * reconozcan de un vistazo.
 *
 * Todos miden 24 unidades, heredan el color con `currentColor` y usan trazo en vez de relleno,
 * salvo donde el relleno **es** la información: el cubo sólido frente al fantasma, o la cara
 * que distingue una vista superior de un alzado.
 */

type IconProps = { readonly className?: string };

/** Envoltura común: mismo lienzo, mismo grosor de trazo y mismos remates para todos. */
function Svg({ className, children }: IconProps & { readonly children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Encuadrar todo: las cuatro esquinas de un visor cerrándose sobre el modelo. */
export function IconFrameAll(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1" />
    </Svg>
  );
}

/** Encuadrar la selección: una diana sobre un elemento. */
export function IconFrameSelection(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Vistas normalizadas: un cubo visto de canto. */
export function IconViews(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M12 3v18M4 7.5l8 4.5 8-4.5" />
    </Svg>
  );
}

/** Vista isométrica: el cubo con dos caras a la vista. */
export function IconViewIso(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M12 12v9l8-4.5v-9L12 12Z" fill="currentColor" fillOpacity={0.35} stroke="none" />
      <path d="M12 12 4 7.5M12 12l8-4.5M12 12v9" />
    </Svg>
  );
}

/** Vista superior: la cara de arriba resaltada. */
export function IconViewTop(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path
        d="M12 3 20 7.5 12 12 4 7.5 12 3Z"
        fill="currentColor"
        fillOpacity={0.5}
        stroke="none"
      />
      <path d="M12 3 20 7.5 12 12 4 7.5 12 3Z" />
    </Svg>
  );
}

/** Alzado frontal: la cara de frente resaltada. */
export function IconViewFront(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M4 7.5 12 12v9l-8-4.5v-9Z" fill="currentColor" fillOpacity={0.5} stroke="none" />
      <path d="M4 7.5 12 12v9l-8-4.5v-9Z" />
    </Svg>
  );
}

/** Alzado lateral: la cara del costado resaltada. */
export function IconViewSide(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M12 12l8-4.5v9L12 21v-9Z" fill="currentColor" fillOpacity={0.5} stroke="none" />
      <path d="M12 12l8-4.5v9L12 21v-9Z" />
    </Svg>
  );
}

/** Proyección: dos líneas que convergen, que es de lo que trata la perspectiva. */
export function IconProjection(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 5l18 4M3 19l18-4" />
      <rect x="14" y="9.5" width="7" height="5" rx="0.8" />
    </Svg>
  );
}

/** Perspectiva: el rectángulo con fuga. */
export function IconPerspective(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4l16 4v8L4 20V4Z" />
      <path d="M4 12h16" strokeDasharray="2 2" />
    </Svg>
  );
}

/** Ortográfica: sin fuga, los lados paralelos. */
export function IconOrthographic(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
      <path d="M4 12h16M12 6v12" strokeDasharray="2 2" />
    </Svg>
  );
}

/** Navegación: la mano con la que se mueve la escena. */
export function IconNavigate(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21a6 6 0 0 0 6-6v-4a1.5 1.5 0 0 0-3 0V8a1.5 1.5 0 0 0-3 0V4.5a1.5 1.5 0 0 0-3 0V13l-1.6-2a1.5 1.5 0 0 0-2.4 1.8L8 18a6 6 0 0 0 4 3Z" />
    </Svg>
  );
}

/** Órbita: girar alrededor de un punto. */
export function IconOrbit(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-25 12 12)" />
      <path d="M18.5 7.5 20 6l1 2.2" />
    </Svg>
  );
}

/** Desplazar: las cuatro direcciones sobre el plano. */
export function IconPan(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v18M3 12h18" />
      <path d="M12 3 9.5 5.8M12 3l2.5 2.8M12 21l-2.5-2.8M12 21l2.5-2.8M3 12l2.8-2.5M3 12l2.8 2.5M21 12l-2.8-2.5M21 12l-2.8 2.5" />
    </Svg>
  );
}

/** Primera persona: recorrer el interior a la altura de los ojos. */
export function IconFirstPerson(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 6.5v6M12 12.5l-3 8M12 12.5l3 8M8 9l8-1.5" />
    </Svg>
  );
}

/** Aspecto: medio cubo lleno, medio vacío. */
export function IconAppearance(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17V3.5Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Sólido: el cubo opaco. */
export function IconSolid(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z"
        fill="currentColor"
        fillOpacity={0.45}
        stroke="none"
      />
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M12 12v9M4 7.5l8 4.5 8-4.5" />
    </Svg>
  );
}

/** Fantasma: el mismo cubo translúcido, con lo de detrás a la vista. */
export function IconGhost(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" strokeDasharray="3 2" />
      <circle cx="12" cy="13" r="2.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Cortes: el plano que atraviesa el modelo. */
export function IconSections(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M2.5 14.5 21.5 9" strokeDasharray="3 2" />
    </Svg>
  );
}

/** Corte horizontal: mirar la planta sin la cubierta. */
export function IconSectionHorizontal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 15h14v4H5z" fill="currentColor" fillOpacity={0.35} stroke="none" />
      <path d="M5 5h14v14H5z" />
      <path d="M3 15h18" strokeDasharray="3 2" />
      <path d="M12 12v-3M10.5 10.5 12 9l1.5 1.5" />
    </Svg>
  );
}

/** Corte vertical longitudinal: por el lado largo. */
export function IconSectionLongitudinal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 5h5v14H5z" fill="currentColor" fillOpacity={0.35} stroke="none" />
      <path d="M5 5h14v14H5z" />
      <path d="M10 3v18" strokeDasharray="3 2" />
      <path d="M13 12h3M14.5 10.5 16 12l-1.5 1.5" />
    </Svg>
  );
}

/** Corte vertical transversal: cruzando el modelo. */
export function IconSectionTransversal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8l7 3v9l-7-3z" fill="currentColor" fillOpacity={0.35} stroke="none" />
      <path d="M11 4 20 8v9l-9 4-7-3V8l7-4Z" />
      <path d="M14.5 2.5 7.5 21" strokeDasharray="3 2" />
    </Svg>
  );
}

/** Medir: la regla. */
export function IconMeasure(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="8" width="21" height="8" rx="1.2" transform="rotate(-15 12 12)" />
      <path d="M7 8.6v2.6M11 7.5v2.6M15 6.4v2.6M19 5.3v2.6" />
    </Svg>
  );
}

/** Distancia: la cota entre dos puntos. */
export function IconDistance(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 17 20 7" />
      <path d="M2.5 14.5 5.5 19.5M18.5 4.5 21.5 9.5" />
      <circle cx="4" cy="17" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="7" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Ángulo: dos lados y el arco entre ellos. */
export function IconAngle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 19h16M4 19 16 5" />
      <path d="M12 19a8 8 0 0 0-1.7-4.9" />
      <circle cx="4" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Área: el contorno cerrado con su superficie. */
export function IconArea(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 8 13 4l6 6-3 9-9-2L5 8Z" fill="currentColor" fillOpacity={0.3} stroke="none" />
      <path d="M5 8 13 4l6 6-3 9-9-2L5 8Z" />
      <circle cx="5" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="13" cy="4" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="10" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Ajuste al vértice: la esquina con su punto marcado. */
export function IconSnapVertex(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V8l8-4 8 4" />
      <path d="M4 20h8" />
      <circle cx="12" cy="4" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="4" r="5" strokeDasharray="2 2" />
    </Svg>
  );
}

/** Punto libre sobre la cara: sin esquina a la que saltar. */
export function IconSnapFree(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V8l8-4 8 4" strokeDasharray="3 2" />
      <circle cx="13" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M13 6.5v2M13 15.5v2M7.5 12h2M16.5 12h2" />
    </Svg>
  );
}

/** Una arista completa, extremo a extremo. */
export function IconEdge(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 17 21 7" />
      <circle cx="3" cy="17" r="2" fill="currentColor" stroke="none" />
      <circle cx="21" cy="7" r="2" fill="currentColor" stroke="none" />
      <path d="M6.5 9.5 14.5 20" strokeDasharray="2 2" />
    </Svg>
  );
}

/** Cerrar el contorno de un área. */
export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12.5 9.5 18 20 6" />
    </Svg>
  );
}

/** Borrar. */
export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10.5 10.5v6M13.5 10.5v6" />
    </Svg>
  );
}

/** Cerrar: la cruz. */
export function IconX(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

/** Visible. */
export function IconEye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  );
}

/** Oculto. */
export function IconEyeOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5l16 14" />
      <path d="M9.5 6C10.3 5.7 11.1 5.5 12 5.5c6 0 9.5 6.5 9.5 6.5s-1 1.9-2.9 3.6" />
      <path d="M16.4 17.4c-1.3.7-2.7 1.1-4.4 1.1-6 0-9.5-6.5-9.5-6.5s1.4-2.6 3.9-4.4" />
      <path d="M10 10.2a2.8 2.8 0 0 0 3.9 3.9" />
    </Svg>
  );
}

/** Subir en la lista. */
export function IconArrowUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />
    </Svg>
  );
}

/** Bajar en la lista. */
export function IconArrowDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" />
    </Svg>
  );
}

/** Desplegar un bloque. */
export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9.5 12 15.5 18 9.5" />
    </Svg>
  );
}

/** Plegar un bloque, o ampliar la columna de herramientas. */
export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 6 15.5 12 9.5 18" />
    </Svg>
  );
}

/** Reducir la columna de herramientas. */
export function IconChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 6 8.5 12 14.5 18" />
    </Svg>
  );
}

/** El árbol del modelo: la jerarquía espacial. */
export function IconTree(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 4v13a2 2 0 0 0 2 2h2M5 10h4M5 16h4" />
      <rect x="11" y="2.5" width="8" height="4" rx="1" />
      <rect x="11" y="8" width="8" height="4" rx="1" />
      <rect x="11" y="17" width="8" height="4" rx="1" />
    </Svg>
  );
}

/** Los modelos cargados, uno sobre otro. */
export function IconLayers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 21 7.5 12 12 3 7.5 12 3Z" />
      <path d="M3 12.5 12 17l9-4.5" />
      <path d="M3 17 12 21.5l9-4.5" />
    </Svg>
  );
}

/**
 * Seleccionar: el puntero.
 *
 * Existe para que **el modo de selección tenga icono propio**. Sin él, salir de una herramienta de
 * medición no tiene a dónde volver, y no se ve en ningún sitio si el clic va a seleccionar o a
 * poner un punto de cota.
 */
export function IconCursor(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 3l6.5 17 2.4-6.6 6.6-2.4L5 3Z" fill="currentColor" fillOpacity={0.25} />
    </Svg>
  );
}
