# Compartir Cerca · Un movimiento entre dos teléfonos por Bluetooth LE

Módulo de Controla+ que comparte **un movimiento financiero** (concepto, monto, tipo y fecha)
entre dos teléfonos con Controla+, directamente por **Bluetooth Low Energy**, sin Internet ni
emparejar los teléfonos desde Ajustes. El teléfono que recibe ve el movimiento y decide si lo
**acepta** (se agrega a sus registros) o lo **rechaza**.

Sustituye a Traspaso Cerca (`traspaso_cerca/`, Wi-Fi Direct) para este caso de uso, pero no lo
reemplaza: Traspaso Cerca sigue siendo la entrega de la semana 5 y mueve archivos grandes, algo
que BLE no puede hacer bien. Aquí el dato ocupa ~150 bytes.

> **Estado: segunda etapa.** El EMISOR usa `@capacitor-community/bluetooth-le`. El RECEPTOR se
> anuncia y recibe con `cordova-plugin-bluetoothle` 6.7.4 (`periferico-cordova.ts`). Falta
> compilar Android y probar entre dos teléfonos (ver
> [Rol periférico](#rol-periférico-cordova-plugin-bluetoothle)).

## Archivos

| Archivo | Descripción |
|---|---|
| `src/app/core/compartir/ble-protocolo.ts` | Contrato entre teléfonos: UUID del servicio GATT, formato `MovimientoCompartido`, validación, troceado en paquetes y `Reensamblador`. TypeScript puro, sin plugins. |
| `src/app/core/compartir/ble-emisor.service.ts` | **Rol EMISOR (central).** Permisos, búsqueda filtrada por servicio, conexión, envío por paquetes y espera de la respuesta, con `@capacitor-community/bluetooth-le`. |
| `src/app/core/compartir/ble-receptor.service.ts` | **Rol RECEPTOR (periférico).** Reensambla, valida, publica `entrante$`, y al aceptar guarda con `OfflineStorageService` + `generarId()`. Habla con el periférico a través de `PERIFERICO_BLE`. |
| `src/app/core/compartir/ble-periferico.ts` | Interfaz `PerifericoBle` y token `PERIFERICO_BLE`, que resuelve a `PerifericoCordova`. Incluye `PerifericoNoDisponible` como reserva. |
| `src/app/core/compartir/periferico-cordova.ts` | **Rol RECEPTOR (periférico).** `PerifericoBle` sobre `cordova-plugin-bluetoothle` 6.7.4: permisos, servidor GATT, servicio, anuncio, `respond()` de cada escritura y notificaciones. Tipos mínimos propios. |
| `src/app/compartir/compartir.page.*` | Página standalone con tres modos (`menu`, `recibir`, `enviar`): elegir movimiento, buscar, conectar, vista previa, Enviar; y en el receptor, Aceptar / Rechazar. |
| `src/theme/compartir.scss` | Estilos de los toasts `toast-compartir` (cian, ámbar, coral). |

## Dependencias con otros módulos

A diferencia de Traspaso Cerca, este módulo **guarda movimientos**, así que depende de
`modo_offline`:

- `src/app/core/offline/movimiento.model.ts`: `Movimiento`, `TipoMovimiento` y `generarId()`.
- `src/app/core/offline/offline-storage.service.ts`: `movimientos$`, `todos()` y `agregar()`.

Las rutas de import (`../offline/...`, `../core/offline/...`) dan por hecho que
`core/offline` está copiado al proyecto, igual que pide el README de `modo_offline`. Por eso
también requiere `IonicStorageModule.forRoot()` en `main.ts`.

## Verificación del plugin `@capacitor-community/bluetooth-le`

Se revisó el paquete publicado **8.3.0** (`latest`, `peerDependencies: @capacitor/core >= 8.0.0`,
en línea con Capacitor 8 del resto del repositorio): definiciones de tipos, código Android
(`BluetoothLe.kt`, `Device.kt`) y su `AndroidManifest.xml`.

| Capacidad | ¿La ofrece? | Uso en este módulo |
|---|---|---|
| Permisos y encendido (`initialize`, `isEnabled`, `requestEnable`) | Sí | `BleEmisorService.preparar()` |
| Buscar filtrando por servicio (`requestLEScan`, `stopLEScan`) | Sí | `buscarReceptores()` |
| Conectar / desconectar (`connect`, `disconnect`) | Sí | `conectar()`, `desconectar()` |
| MTU negociado (`getMtu`; en Android pide 512 al conectar) | Sí | Tamaño de los paquetes |
| Escribir (`write`, `writeWithoutResponse`) | Sí | Envío del movimiento |
| Notificaciones (`startNotifications`) | Sí | Respuesta del receptor |
| **Anunciarse** (`BluetoothLeAdvertiser`) | **No** | — |
| **Servidor GATT** (`BluetoothGattServer`) | **No** | — |
| Permiso `BLUETOOTH_ADVERTISE` en su manifest | **No** | — |

Conclusión: el plugin cubre **todo el rol central** (emisor) y **nada del rol periférico**
(receptor). En BLE, para que dos teléfonos hablen, uno tiene que anunciarse y ofrecer el
servicio GATT; con este plugin solo, ninguno de los dos puede hacerlo.

## Instalación

```bash
npm install @capacitor-community/bluetooth-le @capacitor/device
npm install --save-exact cordova-plugin-bluetoothle@6.7.4   # solo receptor; versión exacta
npm install @ionic/storage-angular        # si aún no está (lo trae modo_offline)
npx cap sync android
```

1. Copia `src/app/core/compartir` y `src/app/compartir` al proyecto (junto a `core/offline`).
2. Añade la ruta en `app.routes.ts`:
   ```ts
   {
     path: 'compartir',
     loadComponent: () => import('./compartir/compartir.page').then((m) => m.CompartirPage),
   },
   ```
   Y, si se usa la barra de pestañas, un `<ion-tab-button tab="compartir">` con el icono
   `bluetooth-outline`.
3. Añade `@use './theme/compartir';` al principio de `src/global.scss`.

### AndroidManifest.xml

Los permisos los declaran los plugins:

- `@capacitor-community/bluetooth-le`: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, los permisos
  heredados con `maxSdkVersion="30"` y la ubicación.
- `cordova-plugin-bluetoothle`: `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_SCAN`,
  `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE` y la ubicación. `npx cap sync` los copia en
  `android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml`.

En el manifest de la app hay que añadir una sola cosa:

```xml
<!-- Se llama a initialize({ androidNeverForLocation: true }): hay que declararlo -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"
                 android:usesPermissionFlags="neverForLocation"
                 tools:targetApi="s" />
```

> **Pendiente de comprobar en el primer build:** los dos plugins declaran `BLUETOOTH` y
> `BLUETOOTH_ADMIN`, uno con `maxSdkVersion="30"` y el otro sin él. Hay que revisar el manifest
> fusionado.

En Android 11 o anterior, buscar dispositivos BLE exige además tener la **ubicación** activada
en el sistema.

## Contrato BLE entre teléfonos

| Elemento | UUID | Propiedades |
|---|---|---|
| Servicio Controla+ | `c9a70001-5e2b-4c1f-9d3a-6b7e0c4f2a10` | Lo anuncia el receptor; el emisor filtra por él |
| `CARACT_MOVIMIENTO` | `c9a70002-5e2b-4c1f-9d3a-6b7e0c4f2a10` | write (con respuesta) |
| `CARACT_RESPUESTA` | `c9a70003-5e2b-4c1f-9d3a-6b7e0c4f2a10` | notify + read |

**Mensaje** (JSON en UTF-8, máximo 1024 bytes):

```json
{ "v": 1, "app": "ControlaPlus", "origenId": "…", "concepto": "Supermercado",
  "monto": 1250, "tipo": "gasto", "fecha": "2026-09-23T14:20:00.000Z", "de": "Galaxy de Ana" }
```

**Paquetes.** Con el MTU por defecto (23) solo caben 20 bytes por escritura, así que el mensaje
se trocea con una cabecera de 2 bytes `[índice][total]`. El índice 0 siempre empieza un mensaje
nuevo; un paquete fuera de orden descarta lo acumulado. Si Android negocia MTU 512, el
movimiento viaja en un solo paquete.

**Respuesta** (texto en `CARACT_RESPUESTA`): `aceptado`, `rechazado`, `duplicado` o `invalido`.

**Validación en el receptor.** Antes de mostrar nada se exige `app === 'ControlaPlus'`, `v === 1`,
concepto de 1 a 80 caracteres, `monto` numérico mayor que 0, `tipo` `gasto` o `ingreso` y fecha
ISO válida.

**Al aceptar** se guarda con `OfflineStorageService.agregar()` un `Movimiento` **nuevo**: `id` de
`generarId()`, la fecha original y `estado: 'pendiente'`, así que `SyncService` lo sube al
servidor como cualquier otro. Si ya existe uno con el mismo concepto, monto, tipo y fecha, no se
duplica y se responde `duplicado`.

## Flujo

```
Teléfono 2 (receptor)                          Teléfono 1 (emisor)
"Recibir"                                      "Enviar"
  └─ PERIFERICO_BLE.iniciar()                    ├─ elegir un movimiento
       anuncia CP_SERVICIO_UUID  ◄── búsqueda ───┤  requestLEScan({ services: [CP_SERVICIO_UUID] })
                                                 ├─ tocar el teléfono → connect + startNotifications
                                                 ├─ vista previa del movimiento
       Reensamblador  ◄──── write × N paquetes ──┤  "Enviar movimiento"
       validar → tarjeta Aceptar / Rechazar      │
  Aceptar → agregar() → notify "aceptado" ──────►└─ toast "…aceptó el movimiento" · disconnect
  Rechazar →            notify "rechazado" ─────►   toast ámbar "…rechazó el movimiento"
```

## Rol periférico: cordova-plugin-bluetoothle

`@capacitor-community/bluetooth-le` no puede anunciarse ni levantar un servidor GATT. Por eso el
receptor usa `cordova-plugin-bluetoothle` **6.7.4** (versión exacta: es la última y el proyecto
no publica versiones desde 2023). `PERIFERICO_BLE` resuelve a `PerifericoCordova` por defecto,
así que no hace falta registrar nada en `main.ts`.

Secuencia de `iniciar()`, respetando lo que se encontró al revisar el código Android del plugin:

1. `hasPermissionBtConnect` / `hasPermissionBtAdvertise` y, si faltan, `requestPermission…`
   (Android 12+). El plugin no los pide por su cuenta y sin ellos la app se cierra.
2. `initialize()`, **antes** de `initializePeripheral()`: es lo único que asigna el adaptador que
   usan `startAdvertising` y `notify`.
3. `initializePeripheral()`: su callback queda abierto y trae todos los eventos (`connected`,
   `writeRequested`, `readRequested`, `notificationSent`…).
4. `removeAllServices()` y `addService()`, con `CARACT_MOVIMIENTO` (write) y `CARACT_RESPUESTA`
   (read + notify).
5. `startAdvertising` con `timeout: 0` (si no, se apaga al segundo), `includeDeviceName: false` e
   `includeTxPowerLevel: false` (si no, el anuncio pasa de 31 bytes), y `name` igual al nombre
   actual del adaptador (el plugin llama a `setName()` con él).

Mientras está activo, cada `writeRequested` se confirma con `respond()`. Sin esa confirmación
el emisor se queda esperando. `notify()` no llama a su `success` en Android, así que la
confirmación se toma del evento `notificationSent`. `detener()` llama a `stopAdvertising()` y a
`removeAllServices()`.

Fuera de Android, o si `window.bluetoothle` no existe, `iniciar()` falla con el mismo mensaje de
siempre: *"Este teléfono todavía no puede recibir por Bluetooth…"*.

## Fuera de alcance

- **iOS.** El emisor funcionaría con el mismo plugin, pero el receptor necesitaría su propio
  periférico en CoreBluetooth.
- **Compartir varios movimientos a la vez**, archivos, fotos o respaldos: para eso está Traspaso
  Cerca.
- **Cifrado a nivel de aplicación.** La conexión no se empareja. El receptor valida todo lo que
  llega y nada se guarda sin que el usuario pulse "Aceptar".
