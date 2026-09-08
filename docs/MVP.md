# MVP — AeroBim

## La frase que define el alcance

> Abrir un modelo IFC en el navegador, recorrerlo, consultar sus propiedades,
> compararlo con el levantamiento y dejar registrada la observación de coordinación
> en un formato que el resto de la industria entienda.

Todo lo que no sirva a esa frase queda fuera de la primera versión. En particular
**no** se está construyendo un modelador: AeroBim revisa y coordina; modelar es
trabajo de Revit, ArchiCAD o Bonsai.

## Qué entra

| Capacidad                                        | Fase | Notas                                                              |
| ------------------------------------------------ | ---- | ------------------------------------------------------------------ |
| Abrir un IFC en el navegador y navegarlo         | 0    | La prueba que valida el stack completo                             |
| Árbol espacial con aislar y ocultar              | 1    | Proyecto → sitio → edificio → planta → elemento                    |
| Propiedades y psets del elemento                 | 1    |                                                                    |
| Planos de corte y secciones                      | 1    |                                                                    |
| Mediciones: distancia, área, ángulo              | 1    |                                                                    |
| Varios modelos a la vez                          | 1    | Arquitectura + estructura + instalaciones. Sin esto no se coordina |
| Vistas guardadas                                 | 1    | Cámara, visibilidad y cortes, por nombre                           |
| Nube de puntos en la escena del modelo           | 2    | Ya convertida fuera de la aplicación                               |
| Alineación nube ↔ modelo                         | 2    | El problema difícil de la fase, no el render                       |
| Desviación entre lo construido y lo modelado     | 2    | La comparación que hoy exige software de pago                      |
| Proyectos, modelos y versiones persistidos       | 3    | Primera fase con backend                                           |
| Metadatos del modelo con `ifcopenshell`          | 3    | Esquema, unidades, georreferenciación, conteo por tipo             |
| Validación IDS                                   | 3    | ¿Trae el modelo la información que el mandante exigió?             |
| Temas de coordinación con viewpoint              | 4    | Cámara, visibilidad y elementos por GUID                           |
| Importar y exportar **BCF 2.1 y 3.0**            | 4    | Debe abrir en Navisworks o Solibri, o no sirve                     |
| Detección de interferencias                      | 5    | `ifcclash` como job, resultados navegables                         |
| Silenciar falsos positivos entre corridas        | 5    | Decide si la funcionalidad se usa o se abandona                    |
| Vista geoespacial con ortofoto y terreno propios | 6    | CesiumJS, sin Cesium ion                                           |
| IFC georreferenciado sobre el terreno            | 6    | Cierra el ciclo con AeroPlanner                                    |

## Qué no entra, y por qué

Esto no es una lista de "después vemos": son decisiones tomadas.

| Qué                                           | Por qué                                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modelar o editar geometría IFC**            | Otro producto, y uno con décadas de competencia madura. Aquí se revisa y se coordina                                                                |
| **Procesar fotogrametría**                    | Generar nubes, ortofotos o DSM desde fotos pide horas de CPU y decenas de GB de RAM. No hay hardware. La aplicación **abre** lo ya generado         |
| **Editar o clasificar nubes de puntos**       | Trabajo de CloudCompare. Aquí se visualiza y se mide                                                                                                |
| **xeokit-sdk**                                | AGPL-3.0. Es el visor BIM web más pulido y trae IFC + nube en una escena listo para usar, pero servir la aplicación obligaría a liberarla o a pagar |
| **Speckle como plataforma**                   | Condicionaría toda la arquitectura a su modelo de datos, y sus comentarios no son BCF nativo. Queda como referencia                                 |
| **iTwin.js / Bentley**                        | MIT en el papel, pero los iModels usables exigen suscripción y la ingesta IFC depende de sus sincronizadores. Curva alta para un MVP independiente  |
| **Cesium ion**                                | El runtime CesiumJS sí se usa; el servicio es comercial. El terreno y las ortofotos son propios — es lo que la familia ya produce                   |
| **4D: planificación de obra sobre el modelo** | Otro producto. Primero hay que ver bien el modelo                                                                                                   |
| **5D: cómputos y presupuesto**                | Ídem. `ifccsv` deja la puerta abierta si algún día se pide                                                                                          |
| **Servidor de teselas propio**                | COG por rangos HTTP y Fragments como archivos estáticos alcanzan                                                                                    |
| **Base de datos compartida con las hermanas** | Regla de la familia. La integración es por archivo y por API                                                                                        |

## Por qué se parte de librerías y no de un fork

AeroPlanner nació de un fork (DroneRoute) porque existía una aplicación MIT que ya
resolvía la mitad del problema. Aquí la situación es distinta: **el visor BIM web
open-source más completo es AGPL**, y los que son permisivos son librerías, no
aplicaciones.

Eso cambia la estrategia. No hay un producto que forkear sin heredar una licencia
que obligaría a liberar todo o a pagar; sí hay un conjunto de piezas MIT/MPL/BSD
maduras y activas —That Open para el visor, IfcOpenShell para el backend, Potree
para las nubes, Cesium para lo geoespacial— con las que se ensambla exactamente el
producto que se necesita.

La contrapartida honesta: se escribe más código de integración que en AeroPlanner, y
la primera versión usable llega más tarde. A cambio no se arrastra la arquitectura
de nadie, y la licencia queda limpia sin condiciones.

## Qué hace a este visor distinto de uno genérico

Hay visores IFC web gratuitos. Dos cosas que ninguno de catálogo puede dar:

**La nube del propio vuelo.** El resto de la familia produce el levantamiento:
AeroPlanner planifica el vuelo, y de ahí sale la ortofoto, el modelo de elevación y
la nube de puntos. Comparar el as-built contra el modelo deja de ser un proyecto
aparte y pasa a ser el paso siguiente de un flujo que ya existe.

**El control de los datos.** Un modelo de obra es información sensible del mandante.
Local-first significa que el IFC no sale de la infraestructura de la organización
para poder mirarlo, y que nadie factura por cargas de modelo ni por puesto de
trabajo.
