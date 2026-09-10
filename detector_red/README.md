# Entregable 1 · Detector de estado de red

Módulo de Controla+ que detecta en tiempo real si el dispositivo tiene conexión a Internet
usando el plugin `@capacitor/network`, y lo refleja en la interfaz con una píldora
**ONLINE / OFFLINE** siempre visible y un banner contextual cuando no hay conexión.

## Archivos

| Archivo | Descripción |
|---|---|
| `src/app/core/network/network.service.ts` | Servicio Angular que envuelve `@capacitor/network`: estado inicial con `Network.getStatus()`, escucha de `networkStatusChange` y publicación como Observable (`isOnline$`, `estado$`). |
| `src/app/core/network/network-status.component.ts` | Componente visual standalone con dos vistas: `pill` (píldora) y `banner` (banner rojo fijo + banner cian de reconexión de 3 s). |
| `src/app/core/network/network-status.component.html` | Plantilla del indicador. |
| `src/app/core/network/network-status.component.scss` | Estilos con la línea gráfica Cyber de Controla+. |
| `src/app/app.component.ts` | Inicializa el servicio una sola vez al arrancar la app. |
| `src/app/home/home.page.*` | Página de ejemplo que muestra la píldora, los banners y los valores `connected` / `connectionType` para las pruebas. |

## Instalación

Dentro de un proyecto Ionic + Angular (standalone) + Capacitor:

```bash
npm install @capacitor/network
npx cap sync
```

Copia la carpeta `src/app/core/network` al proyecto y usa el componente donde lo necesites:

```html
<ion-header>
  <ion-toolbar>
    <ion-title>Controla+</ion-title>
    <app-network-status slot="end" vista="pill"></app-network-status>
  </ion-toolbar>
  <app-network-status vista="banner"></app-network-status>
</ion-header>
```

En `app.component.ts` llama a `NetworkService.init()` una sola vez (ver archivo incluido).

No hace falta configuración adicional: el plugin declara por sí mismo el permiso
`ACCESS_NETWORK_STATE` en Android y no requiere permisos en iOS.

> **Versiones.** El código se compiló en producción con Ionic 9 + Angular 22 + Capacitor 8, donde los
> componentes standalone se importan desde `@ionic/angular`. Si el proyecto usa Ionic 7 u 8, cambia
> esa ruta por `@ionic/angular/standalone` en los archivos `.ts`; el resto es idéntico.

## Cómo funciona

```ts
// Estado inicial
const status = await Network.getStatus();
console.log('Conectado:', status.connected);

// Cambios en tiempo real
Network.addListener('networkStatusChange', status => {
  console.log('Estado de red:', status.connected);
  this.isOnline = status.connected;
});
```

`NetworkService` ejecuta exactamente ese flujo, pero publica el resultado en un
`BehaviorSubject` y lo emite dentro de `NgZone.run()` para que Angular actualice la vista
aunque el evento provenga del código nativo. `NetworkStatusComponent` solo se suscribe a
`isOnline$`; no conoce el plugin, lo que permite reutilizarlo o sustituir la fuente de datos
en pruebas.

## Pruebas con modo avión

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Abrir la app con WiFi o datos activos | Píldora **ONLINE** (punto cian). Consola: `Estado de red: true · tipo: wifi` |
| 2 | Activar el modo avión | En menos de 1 s la píldora pasa a **OFFLINE** (punto coral) y aparece el banner rojo "Sin conexión a Internet". Consola: `Estado de red: false · tipo: none` |
| 3 | Desactivar el modo avión | Píldora vuelve a **ONLINE**, desaparece el banner rojo y se muestra 3 s el banner cian "Conexión restablecida". |
| 4 | Repetir varias veces seguidas | El indicador nunca se desincroniza; `distinctUntilChanged` evita emisiones duplicadas. |

Dónde probar:

- **Android (emulador o físico):** panel rápido → Modo avión. En el emulador también sirve
  Extended controls → Cellular → Data status: Denied.
- **iOS (dispositivo físico):** Centro de control → Modo avión. El simulador de iOS no tiene
  modo avión; se puede apagar el WiFi del Mac.
- **Navegador (`ionic serve`):** DevTools → Network → Offline. En web el plugin usa
  `navigator.onLine` y los eventos `online` / `offline`.
