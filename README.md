# Controla+ · Módulo de conectividad WiFi (AP4)

Asignatura: Programación de Dispositivos Móviles (UAPA).
Autor: Francisco Díaz.

Controla+ es una aplicación de control de gastos, hábitos y metas construida con Ionic, Angular y
Capacitor. Este repositorio contiene el módulo de conectividad de la AP4: detección del estado de
red en tiempo real, modo offline con almacenamiento local y sincronización automática al recuperar
la conexión.

Incluye además **Traspaso Cerca**, un módulo independiente que transfiere el respaldo, las fotos de
recibos y los reportes entre dos teléfonos por Wi-Fi Direct, sin router, sin Internet y sin nube.

## Contenido

| Carpeta / archivo | Descripción |
|---|---|
| `detector_red/` | **Entregable 1.** `NetworkService` sobre `@capacitor/network` y `NetworkStatusComponent` (píldora ONLINE/OFFLINE y banners). |
| `modo_offline/` | **Entregable 2.** Persistencia con `@ionic/storage`, lógica online/offline, sincronización automática con reintentos y prototipo web autónomo. |
| `documentacion/` | **Entregable 3.** Documentación técnica (docx), diagramas de flujo y arquitectura, capturas con y sin conexión. |
| `traspaso_cerca/` | **Módulo Traspaso Cerca.** Transferencia de archivos entre dos teléfonos por Wi-Fi Direct: mini servidor HTTP en el receptor y descubrimiento por sondeo del rango `192.168.49.x` en el emisor, sin código nativo. |
| `compartir_cerca/` | **Módulo Compartir Cerca.** Comparte un movimiento entre dos teléfonos por Bluetooth LE: emisor con `@capacitor-community/bluetooth-le` y receptor (periférico) con `cordova-plugin-bluetoothle` 6.7.4. El receptor acepta o rechaza el movimiento. |
| `app/` | **Aplicación ejecutable** (Ionic 9 + Angular 22 + Capacitor 8) que ensambla `detector_red`, `modo_offline` y `compartir_cerca`, con pestañas Inicio y Compartir. `traspaso_cerca` no se integra. Se construye con `cd app && npm install && npx @ionic/cli build && npx cap sync android`. |
| `Diseno_Interfaz_Conectividad_ControlaPlus.docx` | Diseño de interfaz: componentes, catálogo de mensajes y especificaciones de estilo. |
| `index.html` | Prototipo interactivo del módulo; se abre directamente en el navegador. |
| `capturas/` | Pantallas A (online), B (offline con movimiento pendiente), C (reconexión) y D (fallo de sincronización). |
| `ENLACE_GITHUB.txt` | URL de este repositorio, tal como se incluye en el ZIP de entrega. |

## Cómo ver el prototipo

Abre `index.html` en el navegador. El móvil reacciona a la red real (modo avión o WiFi apagado)
y el panel lateral permite simular la desconexión, el fallo del servidor y reproducir las tres
pantallas del documento de diseño.

## Cómo integrar el módulo en el proyecto Ionic

```bash
npm install @capacitor/network @ionic/storage-angular
npx cap sync
```

Copia `detector_red/src/app/core/network` y `modo_offline/src/app/core/offline` al proyecto y
sigue los pasos del README de cada carpeta. El código se compiló en producción con Ionic 9,
Angular 22 y Capacitor 8; para Ionic 7 u 8 solo cambia la ruta de importación a
`@ionic/angular/standalone`.

Traspaso Cerca se instala aparte, porque usa otros plugins:

```bash
npm install cordova-plugin-webserver @awesome-cordova-plugins/web-server
npm install @capacitor/filesystem @capacitor/device
npx cap sync
```

Copia `traspaso_cerca/src/app/services` y `traspaso_cerca/src/app/traspaso`, y sigue los pasos de
`traspaso_cerca/README.md` (hay que declarar `WebServer` en los `providers` y permitir el tráfico
en claro hacia `192.168.49.1`).
