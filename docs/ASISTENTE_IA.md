# Asistente de IA en AeroBim (diseño, 2026-10-13)

Estado: **diseño; nada de esto está construido.** La fila es `F17.3` y espera tres decisiones del usuario
(al final).

## Qué se quiere

Un chat dentro del visor que **ayude a usar la aplicación y a leer el modelo**: «¿qué hay en el piso 5?»,
«aísla los muros de hormigón», «genera la planta de esto», «¿cómo hago un perfil?». La referencia es el botón
«AI chat» de la cinta de _Open BIM Studio_, un visor sobre That Open Company que se ve en la captura que
trajo el usuario. (La publicación de LinkedIn no se pudo leer desde aquí; el diseño parte de la captura.)

## Lo que no se negocia (de `AGENTS.md`)

- **Local-first.** Un asistente en la nube lo contradice. Por eso es **opcional, apagado por defecto y por
  organización**, y el proveedor es **intercambiable**: el servidor habla el protocolo de _chat completions_
  de OpenAI, que lo entienden NVIDIA, Ollama y vLLM. Con un modelo local se recupera el local-first entero.
- **La aplicación no procesa ni modela** (decisión 6): el asistente **lee y navega**; no edita geometría ni
  genera datos de obra. Las acciones que cambian el estado de la vista (aislar, encuadrar, generar un plano)
  piden **confirmación** en pantalla.
- **La clave no sale del servidor.** Nunca en el repositorio, en el navegador, en un mensaje de chat ni en un
  encargo a un subagente.
- **La CSP no cambia** (decisión 10 y `prod.py`): el navegador solo habla con el origen propio. Quien llama a
  NVIDIA es Django.

## Cómo se hace

**Servidor** (`services/api/apps/asistente`, app nueva):

- Un único endpoint `POST /api/asistente/chat/`, **con streaming**, que reenvía a
  `NIM_BASE_URL` (por defecto `https://integrate.api.nvidia.com/v1`) con `NIM_MODEL`.
- La clave sale de la variable de entorno `NIM_API_KEY` (prefijo `nvapi-`), puesta por quien despliega en
  el archivo de entorno del servicio con modo `600`, y **solo se lee ahí**. Si falta, el asistente **no
  aparece**.
- **Contrato de permisos del proyecto:** permiso propio `asistente.use_asistente`; interruptor por
  `Organizacion`; **403** para quien no lo tiene y su fila en `test_permisos.py`; queryset acotado por
  organización en todo lo que lea.
- **Auditoría:** un `AuditEvent` por consulta (usuario, organización, modelo, tokens), **sin guardar el
  texto**.
- **Límite de ritmo** propio (el nivel gratuito ronda **40 peticiones por minuto**, variable según modelo y
  tráfico) con reintento y mensaje claro, no un error mudo.

**Navegador** (`apps/web`):

- Un panel «Asistente» acoplable, con el patrón del buscador. El navegador manda **la pregunta y un
  contexto elegido por la persona** —el elemento seleccionado, el árbol resumido, los recuentos—, **nunca el
  archivo IFC**.
- **Herramientas de solo lectura** que el modelo puede pedir por _function calling_ y que se ejecutan **en el
  navegador**, sobre el modelo ya abierto: `buscarElementos`, `propiedadesDe(guid)`, `contarPorClase`,
  `resumenDelArbol`. Y las que cambian la vista, con confirmación: `aislar(guids)`, `encuadrar(guid)`,
  `generarPlano(vista, alcance)`. **El GUID es la identidad**, nunca un `expressID`.

## Qué se sabe de NVIDIA (investigado el 2026-10-13)

- El catálogo de `build.nvidia.com` ofrece modelos por una API **compatible con OpenAI** en
  `https://integrate.api.nvidia.com/v1` (`/chat/completions`); la clave se crea en
  `build.nvidia.com/settings/api-keys`. El _function calling_ con la forma de OpenAI funciona con modelos que
  lo soportan: **hay que elegir uno que lo diga**.
- **Límites:** las fuentes **no coinciden** y no hay una página oficial clara. Unas hablan de unos 1 000
  créditos y 40 solicitudes por minuto; otras dicen que el modelo de créditos terminó y que el límite depende
  del modelo y del tráfico. Se planifica con **~40 por minuto** y se comprueba en la cuenta.
- Para más ritmo hay que pagar o desplegar el modelo propio con NIM.

Fuentes: [guía de NVIDIA Build](https://pasqualepillitteri.it/en/news/1621/nvidia-build-free-api-100-ai-models-2026),
[ejemplo oficial del catálogo](https://build.nvidia.com/openai/gpt-oss-20b),
[hilos del foro de desarrolladores sobre el límite](https://forums.developer.nvidia.com/t/request-for-nvidia-build-api-rate-limit-increase-40-rpm-200-rpm/378450).

## Decisiones que son del usuario

1. **¿NVIDIA en la nube, o un modelo local?** La nube es lo más rápido de empezar y envía preguntas y contexto
   fuera de la VM; local mantiene todo dentro y exige una máquina con GPU.
2. **¿Qué puede salir de la VM?** Propuesta: solo la pregunta y el contexto que la persona elige; nunca
   archivos, nombres de cliente ni datos de obra completos.
3. **¿Quién lo ve primero?** Propuesta: apagado, y encendido solo para la organización del piloto.

**La clave:** cuando se decida, se pone **en la VM**, en el archivo de entorno del servicio, y **no se pega en
el chat ni se sube a ningún archivo**. Si alguna vez se pegó en un sitio indebido, se revoca en
`build.nvidia.com` y se crea otra.
