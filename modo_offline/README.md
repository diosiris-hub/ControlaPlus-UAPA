# Entregable 2 · Modo offline funcional

Controla+ sigue operando sin conexión: los movimientos se guardan en el dispositivo con
`@ionic/storage`, el usuario recibe un mensaje amigable y, al recuperar la conexión, los datos
pendientes se sincronizan solos con el servidor.

Este entregable **incluye y amplía** el detector de red del Entregable 1 (`src/app/core/network`
debe copiarse también; es el mismo código de la carpeta `detector_red`).

## Archivos

| Archivo | Descripción |
|---|---|
| `src/app/core/offline/movimiento.model.ts` | Modelo `Movimiento` con el campo `estado: 'pendiente' \| 'sincronizado'` y generador de UUID en el cliente. |
| `src/app/core/offline/mensajes.ts` | Catálogo de mensajes exactos del documento de diseño y duraciones (toast 4 s, reintento 6 s). |
| `src/app/core/offline/offline-storage.service.ts` | Persistencia local con `@ionic/storage-angular`. Expone `movimientos$`, `pendientes()`, `agregar()`, `marcarSincronizados()`. |
| `src/app/core/offline/api.service.ts` | Cliente HTTP hacia el backend. Con `usarServidorSimulado` responde localmente para poder probar sin servidor y forzar fallos. |
| `src/app/core/offline/sync.service.ts` | Sincronización automática al pasar de offline → online, con toast de resultado y reintento ante fallos. |
| `src/app/core/offline/movimientos.service.ts` | Lógica condicional: **offline → guardar local y avisar; online → guardar local, enviar y marcar sincronizado**. |
| `src/app/home/home.page.*` | Pantalla de inicio: balance, lista con etiqueta "⏳ Pendiente de sincronizar" y botón (+) para registrar. |
| `src/app/app.component.ts` | Inicializa `NetworkService` y activa `SyncService` al arrancar. |
| `src/main.ts` | Proveedores: `provideHttpClient()` e `IonicStorageModule.forRoot()`. |
| `src/theme/conectividad.scss` | Estilos de los toasts (cian / ámbar / oscuro) y de la alerta de registro. |
| `src/environments/environment.ts` | `apiUrl`, `usarServidorSimulado`, `cargarDatosDemo`. |
| `prototipo_web/` | Prototipo HTML autónomo con la misma lógica (se abre en el navegador sin instalar nada). |

## Instalación

```bash
npm install @capacitor/network @ionic/storage-angular
npx cap sync
```

1. Copia `src/app/core/network` (Entregable 1) y `src/app/core/offline` al proyecto.
2. Sustituye `src/main.ts`, `src/app/app.component.ts` y `src/app/home/*` por los incluidos,
   o integra sus partes en los tuyos.
3. Añade `@use './theme/conectividad';` como **primera línea** de `src/global.scss` (Sass exige que
   las reglas `@use` vayan antes que cualquier otra).
4. Ajusta `src/environments/environment.ts` con la URL real del backend y pon
   `usarServidorSimulado: false` cuando exista el endpoint `POST /movimientos/lote`.

> **Versiones.** Compilado en producción con Ionic 9 + Angular 22 + Capacitor 8 +
> `@ionic/storage-angular` 4. En Ionic 7 u 8 cambia `@ionic/angular` por `@ionic/angular/standalone`
> en los imports de componentes y controladores; el resto es idéntico.

## Flujo

```
Usuario confirma movimiento
        │
        ▼
OfflineStorageService.agregar()  ← siempre, estado = 'pendiente'
        │
        ├─ sin conexión ──► toast "Movimiento guardado en tu teléfono…"
        │                   tarjeta con "⏳ Pendiente de sincronizar"
        │
        └─ con conexión ──► ApiService.enviarMovimientos()
                              ├─ ok    ──► marcarSincronizados() · toast "Movimiento enviado al servidor."
                              └─ error ──► toast ámbar · SyncService.programarReintento()

Se recupera la conexión (NetworkService: false → true)
        │
        ▼
SyncService.sincronizar('reconexión')
        ├─ ok    ──► "Sincronización completada: N movimiento(s) enviado(s) al servidor."
        └─ error ──► "Volvió la conexión, pero algunos movimientos no se enviaron…" · reintento en 6 s
```

## Pruebas realizadas

| Caso | Pasos | Resultado |
|---|---|---|
| Registro sin conexión | Modo avión → (+) → confirmar | Toast oscuro, tarjeta con borde y etiqueta ámbar, dato persistido en Ionic Storage |
| Persistencia | Cerrar la app en modo avión y volver a abrirla | El movimiento pendiente sigue en la lista con su etiqueta |
| Sincronización automática | Desactivar el modo avión | Banner "Conexión restablecida" 3 s, toast "Sincronización completada: 1 movimiento enviado al servidor.", desaparece la etiqueta |
| Fallo del servidor | `ApiService.simularFallo = true` y reconectar | Toast ámbar; a los 6 s se reintenta; al desactivar el fallo, sincroniza |
| Registro con conexión | (+) → confirmar con red | Guardado local + envío inmediato; toast "Movimiento enviado al servidor." |
| La app nunca se bloquea | Navegar y registrar en modo avión | Todas las pantallas responden; solo cambia el indicador y los mensajes |

## Decisión: `@ionic/storage` frente a `localStorage`

Se eligió `@ionic/storage-angular` porque usa IndexedDB o SQLite en lugar de `localStorage`
(límite de ~5 MB, síncrono y borrable por el sistema en iOS bajo presión de espacio), mantiene
la misma API en web, Android e iOS y permite crecer a otros tipos de datos sin cambiar el
servicio. El prototipo web usa `localStorage` únicamente para no requerir instalación.
