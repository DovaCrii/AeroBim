/**
 * El tema guardado, aplicado **antes del primer pintado**.
 *
 * Va antes de React y no dentro de un componente por una razón que se ve: React monta después del
 * primer fotograma, así que aplicando el tema desde un componente hay un destello del tema
 * equivocado en cada carga — y en un visor que arranca WASM, ese «después» son cientos de
 * milisegundos, no uno.
 *
 * Es la misma clave que el portal (`aerobim:tema`) y el mismo `try`/`catch`: un navegador con el
 * almacenamiento bloqueado lanza al **leer**, y sin la guarda la página no llega a pintarse.
 *
 * ## Por qué es un archivo y no un `<script>` en línea
 *
 * Estaba en línea, con el motivo escrito de que un `<script src>` es otra petición antes del primer
 * pintado. El motivo era bueno y la conclusión estaba equivocada: **en producción no se ejecutaba**.
 *
 * El comentario decía que Django sirve esta página «como estático desde `/static/visor/` con su
 * propia cabecera». No lo hace: la sirve `apps/visor/views.py`, una vista con `LoginRequiredMixin`
 * —tiene que serlo, porque un estático no se puede poner detrás del login—, y por tanto pasa por el
 * middleware que pone la CSP. En producción esa política se **aplica** y lleva `script-src 'self'`
 * sin `'unsafe-inline'`, así que el navegador bloqueaba este script en cada carga. Resultado: quien
 * hubiera elegido el tema claro entraba siempre en oscuro, más una violación de CSP en la consola
 * que nadie miraba. El clásico «funciona en desarrollo».
 *
 * Como archivo del mismo origen, `script-src 'self'` lo permite. El coste es la petición que se
 * quería evitar: son unos cientos de bytes desde el mismo servidor y con la caché de los estáticos,
 * frente a un tema que no se aplicaba nunca.
 */
try {
  if (localStorage.getItem("aerobim:tema") === "claro")
    document.documentElement.setAttribute("data-theme", "light");
} catch (e) {
  /* sin almacenamiento se queda el oscuro, que es el de partida */
}
