# Controla+ · Módulo de conectividad WiFi (AP4)

Asignatura: Programación de Dispositivos Móviles (UAPA).
Autor: Francisco Díaz.

Controla+ es una aplicación de control de gastos, hábitos y metas construida con Ionic, Angular y
Capacitor. Este repositorio contiene el módulo de conectividad de la AP4: detección del estado de
red en tiempo real, modo offline con almacenamiento local y sincronización automática al recuperar
la conexión.

## Contenido

| Carpeta / archivo | Descripción |
|---|---|
| `detector_red/` | **Entregable 1.** `NetworkService` sobre `@capacitor/network` y `NetworkStatusComponent` (píldora ONLINE/OFFLINE y banners). |
| `modo_offline/` | **Entregable 2.** Persistencia con `@ionic/storage`, lógica online/offline, sincronización automática con reintentos y prototipo web autónomo. |
| `documentacion/` | **Entregable 3.** Documentación técnica (docx), diagramas de flujo y arquitectura, capturas con y sin conexión. |
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
