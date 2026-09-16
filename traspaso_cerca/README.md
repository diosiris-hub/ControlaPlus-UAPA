# Traspaso Cerca · Transferencia por Wi-Fi Direct

Módulo de Controla+ que traspasa el respaldo de movimientos (JSON), las fotos de recibos y los
reportes PDF **entre dos teléfonos**, sin router, sin Internet y sin nube. Un teléfono se pone en
modo **Recibir** y el otro en modo **Enviar**; los archivos viajan por la red del grupo Wi-Fi
Direct que forma el sistema operativo.

Es un módulo nuevo e independiente del módulo de conectividad (`detector_red/`, `modo_offline/`):
no comparte servicios con él y puede copiarse por separado.

**Por qué Wi-Fi Direct y no Bluetooth.** El volumen de datos (≈50 MB entre respaldo y recibos) es
impráctico por BLE, que se mueve entre 1 y 3 Mbps. Wi-Fi Direct alcanza 250 Mbps o más.

## Decisión de arquitectura: sin código nativo

No existe plugin oficial de Capacitor para Wi-Fi Direct, y escribir uno en Java queda fuera del
alcance de la asignatura. La solución se apoya en un dato del estándar:

1. **La formación del grupo P2P la hace el sistema operativo.** El usuario empareja los dos
   teléfonos en `Ajustes → Wi-Fi → Wi-Fi Direct`. La app solo recuerda ese paso con una nota en
   pantalla; no lo automatiza.
2. **La app opera sobre la red que el grupo crea.** En Wi-Fi Direct, Android asigna siempre al
   *Group Owner* la IP `192.168.49.1` y a los clientes IPs del rango `192.168.49.x`. Ese rango fijo
   es lo que hace posible el descubrimiento sin API nativa.
3. **Dos roles dentro de la app.** El receptor levanta un mini servidor HTTP en el puerto `8988`;
   el emisor sondea las IPs del grupo buscando ese servidor y envía por `POST`.

Resultado: todo el código es TypeScript/Angular y el único permiso necesario es
`android.permission.INTERNET`.

## Archivos

| Archivo | Descripción |
|---|---|
| `src/app/services/transfer-server.service.ts` | **Rol RECEPTOR.** Mini servidor HTTP en el puerto 8988 sobre `cordova-plugin-webserver`. Sirve `/info`, recibe `/upload`, escribe en `Directory.Data/traspaso` y publica `recibidos$` y `error$`. |
| `src/app/services/transfer-client.service.ts` | **Rol EMISOR.** Sondea `192.168.49.x` en paralelo con `CapacitorHttp`, valida la firma de la app y sube los archivos en secuencia publicando `receptores$` y `progreso$`. |
| `src/app/traspaso/traspaso.page.ts` | Página standalone con tres modos (`menu`, `recibir`, `enviar`). Solo pinta y delega; los errores se avisan con toasts. |
| `src/app/traspaso/traspaso.page.html` | Plantilla: nota del paso previo, lista de receptores, selección de contenido y barra de progreso. |
| `src/app/traspaso/traspaso.page.scss` | Estilos con la línea gráfica Cyber de Controla+. |
| `src/app/tabs/tabs.page.*` | Barra de pestañas con la pestaña **Traspaso**. |
| `src/app/app.routes.ts` | Registro de la ruta `/tabs/traspaso` y del alias directo `/traspaso`. |
| `src/theme/traspaso.scss` | Tokens `--cp-*` globales y estilos de toasts y barra de pestañas. |
| `src/main.ts` | Proveedores. Incluye `WebServer`, que es obligatorio declarar (ver más abajo). |

## Instalación

```bash
npm install cordova-plugin-webserver @awesome-cordova-plugins/web-server
npm install @capacitor/filesystem @capacitor/device
npx cap sync
```

`@capacitor/core` (para `CapacitorHttp`) ya está en el proyecto.

1. Copia `src/app/services` y `src/app/traspaso` al proyecto.
2. Copia `src/app/tabs` y `src/app/app.routes.ts`, o añade a los tuyos la pestaña y la ruta
   `traspaso` (ambos archivos llevan comentado qué trozo hay que integrar).
3. Añade `@use './theme/traspaso';` como **primera línea** de `src/global.scss` (Sass exige que las
   reglas `@use` vayan antes que cualquier otra).
4. Añade `WebServer` al array `providers` de `src/main.ts`.

> **`WebServer` hay que proveerlo a mano.** Las clases de `@awesome-cordova-plugins` son
> `@Injectable()` **sin** `providedIn: 'root'`. Si no se declara en los `providers`, la inyección
> falla con `NullInjectorError: No provider for WebServer` la primera vez que se abre la pantalla.

### AndroidManifest.xml

```xml
<!-- La formación del grupo Wi-Fi Direct la gestiona el sistema operativo,
     por lo que la app solo necesita el permiso de red estándar -->
<uses-permission android:name="android.permission.INTERNET" />
```

> **Tráfico en claro.** El grupo P2P ya va cifrado con WPA2, pero el traspaso usa `http://` dentro
> de esa red. Desde Android 9, `usesCleartextTraffic` está desactivado por defecto, así que hay que
> permitir el rango del grupo en `res/xml/network_security_config.xml`:
>
> ```xml
> <network-security-config>
>   <domain-config cleartextTrafficPermitted="true">
>     <domain includeSubdomains="false">192.168.49.1</domain>
>   </domain-config>
> </network-security-config>
> ```

> **Versiones.** El resto del repositorio se compiló con Ionic 9 + Angular 22 + Capacitor 8, donde
> los componentes standalone se importan desde `@ionic/angular`. Si el proyecto usa Ionic 7 u 8,
> cambia esa ruta por `@ionic/angular/standalone` en los archivos `.ts`; el resto es idéntico.

## Contrato HTTP entre dispositivos

Puerto **8988**, constante compartida `PUERTO_TRASPASO`.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| `GET` | `/info` | — | `{ "app": "ControlaPlus", "dispositivo": "<nombre>" }` |
| `POST` | `/upload` | `{ "nombre": "<archivo>", "base64": "<datos>" }` | `{ "ok": true }` |
| cualquiera | otra | — | `404` |

El método forma parte del contrato: `/info` solo responde a `GET` y `/upload` solo a `POST`.
Cualquier otra combinación cae en el `404`, igual que una ruta desconocida.

**Validación de la firma.** El emisor comprueba `app === 'ControlaPlus'` en la respuesta de `/info`
antes de listar un receptor: cualquier otro servicio que conteste en el puerto 8988 se descarta y
no aparece en pantalla. Por su parte el receptor valida el sobre de `/upload` antes de escribir
nada: exige que `nombre` y `base64` sean cadenas y responde `400` si no lo son. Además sanea
`nombre` con `sanearNombre()`, que deja solo el nombre del archivo, de modo que un emisor no puede
escribir fuera de `Directory.Data/traspaso` con rutas del tipo `../../otra_cosa`.

## Flujo

```
Ajustes → Wi-Fi → Wi-Fi Direct  (lo hace el usuario en ambos teléfonos)
        │
        ├── Teléfono A: "Recibir"
        │       └─ WebServer.start(8988) ──► espera peticiones
        │                                     /info   → firma ControlaPlus
        │                                     /upload → Filesystem.writeFile + recibidos$
        │
        └── Teléfono B: "Enviar"
                └─ sondeo EN PARALELO de 192.168.49.1 … .21   (GET /info, 1,5 s por IP)
                       └─ responde con la firma ──► aparece en receptores$
                              │
                              ▼  el usuario toca el receptor
                       envío SECUENCIAL, un archivo por vez
                              ├─ ok    ──► progreso$ avanza
                              └─ error ──► se anota el fallo y SIGUE con el resto
                                            │
                                            ▼
                        toast final: completado · parcial (ámbar) · nada (coral)
```

## Decisiones de implementación

**Sondeo en paralelo, envío en secuencia.** El descubrimiento lanza las 21 peticiones a la vez con
`Promise.all`: con 1,5 s de espera por IP, el barrido completo termina en torno a ese mismo tiempo
en lugar de los ~31 s que costaría en serie. Los envíos, en cambio, van uno detrás de otro para que
el progreso tenga un orden legible y para no hacer competir por el enlace a varios archivos de
decenas de MB.

**Las carpetas se expanden antes de enviar.** El contrato HTTP mueve archivos sueltos, pero el
usuario marca conceptos: "Fotos de recibos" es una carpeta. `expandir()` recorre la selección y la
convierte en una lista plana de archivos, entrando también en las subcarpetas. Gracias a eso el
total de la barra de progreso es el número real de archivos, no el de casillas marcadas.

El tipo de cada ruta se consulta con `Filesystem.stat()`, **no** probando si `readdir()` lanza una
excepción. Sobre un archivo, `readdir` falla en Android pero devuelve una lista vacía en la
implementación web, y esa diferencia hacía que los archivos sueltos se expandieran a cero elementos
y no se enviaran, sin ningún aviso. Se detectó ejecutando el módulo, no leyéndolo.

**El sondeo lleva su propio tiempo de espera.** `connectTimeout` y `readTimeout` solo los respeta la
implementación **nativa** de `CapacitorHttp`; en web se ignoran y cada petición queda colgada hasta
que expira el TCP del sistema, más de un minuto. `conLimite()` acota cada saludo con `Promise.race`,
de modo que el barrido completo termina en torno a 1,5 s en cualquier plataforma. Ese límite propio
es lo que garantiza el criterio de aceptación de los 3 segundos. No se aplica a la subida: abandonar
un envío de decenas de MB que sigue viajando dejaría al receptor con un archivo a medias.

**El estado de la pantalla son señales.** Angular 22 detecta cambios sin Zone.js, y en ese modo
asignar a un campo normal de la clase después de un `await` no repinta la vista: el sondeo terminaba
pero el spinner se quedaba clavado. Con `signal()` y `computed()` la pantalla funciona igual con
Zone.js que sin él. Por el mismo motivo la casilla de selección no usa `[(ngModel)]` sino
`[checked]` con `(ionChange)`, que pasa el cambio por la señal `contenido()`.

**Un fallo no cancela el traspaso.** Cada archivo se envía dentro de su propio `try/catch`.
`enviarArchivos()` devuelve la lista de fallos y la página resume el resultado en un solo toast:
verde cuando todo llegó, ámbar cuando el traspaso fue parcial, coral cuando no llegó nada.

**El progreso sale de `progreso$`.** La barra se enlaza al observable con `async`; la página no
guarda ningún contador propio, así que no puede desincronizarse del envío real.

**Tiempos de espera distintos por operación.** El sondeo usa 1,5 s porque 20 de las 21 IPs no van a
contestar y no tiene sentido esperarlas. La subida usa 1,5 s para conectar pero 120 s para leer,
porque la carpeta de recibos ronda los 46 MB.

**Nombre del teléfono con reserva.** `Device.getInfo()` expone `name` en Android 7.1 o superior; si
no está disponible se usa `model`, y si tampoco, la etiqueta "Teléfono Controla+". El receptor
nunca aparece en la lista del emisor sin nombre.

**El servidor se detiene al salir.** `ngOnDestroy()` llama a `detener()`, que además cancela la
suscripción a `onRequest()`. Sin esto el puerto 8988 queda ocupado y volver a entrar en la pantalla
falla al arrancar el servidor.

**La suscripción a `onRequest()` lleva rama de error.** Si el plugin nativo no está presente, por
ejemplo al abrir la app en el navegador con `ionic serve`, el observable falla; sin esa rama RxJS lo
lanza como error no capturado y ensucia la consola. Con ella, el fallo llega a `error$` y la
pantalla lo muestra como toast y vuelve al menú.

**El toast se levanta por encima de la barra de pestañas.** Va abajo, igual que el tab bar, y sin un
desplazamiento el recuadro queda por detrás y el mensaje se lee a medias. Se desplaza el elemento
entero con `transform`, porque el borde y el fondo los dibuja el contenedor externo: un
`margin-bottom` en `::part(container)` sube el texto pero deja la caja tapada igual.

## Cumplimiento de los requisitos de calidad

| Requisito | Dónde se cumple |
|---|---|
| Sondeo en paralelo con `connectTimeout: 1500` | `transfer-client.service.ts` · `buscarReceptores()` con `Promise.all`, más `conLimite()` para que el límite valga también en web |
| Envío secuencial, un fallo no afecta al resto | `transfer-client.service.ts` · bucle `for` con `try/catch` por archivo |
| Validación de la firma `ControlaPlus` | `transfer-client.service.ts` · `saludar()`; el sobre de `/upload` se valida en `leerSobre()` |
| Servidor detenido en `ngOnDestroy()` | `traspaso.page.ts` · `ngOnDestroy()` y botón "Menú" |
| Barra de progreso alimentada por `progreso$` | `traspaso.page.html` · `cliente.progreso$ \| async` |
| Paso previo explicado en lenguaje simple | `traspaso.page.html` · tarjeta "Paso previo" del modo menú |
| Sin `console.log`; errores por toast | `error$` en el servidor y el método `toast()` de la página |
| Componentes standalone, sin NgModules | `traspaso.page.ts`, `tabs.page.ts` y `loadComponent` en `app.routes.ts` |

## Probarlo sin dos teléfonos

El módulo se puede levantar con `ionic serve` y la pantalla funciona entera, con una salvedad
importante: **`cordova-plugin-webserver` es nativo y no existe en el navegador**, así que el rol
RECEPTOR no puede abrir el puerto. Al pulsar "Recibir" la app avisa con un toast y vuelve al menú,
que es el comportamiento correcto ante un fallo del plugin.

El rol EMISOR sí se puede probar entero. Basta con levantar un receptor de mentira que cumpla el
contrato y añadir su IP al rango sondeado:

```js
// receptor de prueba en Node (añadir cabeceras CORS: en web CapacitorHttp usa fetch)
GET  /info    -> { "app": "ControlaPlus", "dispositivo": "Galaxy de Francisco" }
POST /upload  -> { "ok": true }
```

```ts
// en transfer-client.service.ts, solo mientras se prueba
export const IPS_GRUPO = ['127.0.0.1', '192.168.49.1', ...];
```

Con eso se comprueba el descubrimiento, la validación de la firma, la expansión de carpetas, el
envío secuencial y la barra de progreso sin salir del portátil.

## Comprobado en ejecución

Sobre un proyecto Ionic 9 + Angular 22 + Capacitor 8 servido en local, contra un receptor de Node
que implementa el contrato:

| Comprobación | Resultado |
|---|---|
| Descubrimiento: nombre e IP del receptor tomados de `/info` | Correcto |
| Sondeo de 21 IPs | 1,95 s, por debajo del criterio de 3 s |
| Expansión de la carpeta de recibos | 3 elementos marcados → 4 archivos enviados |
| Integridad: contenido recibido byte a byte | Correcto en los 4 archivos |
| Barra de progreso al terminar | 4 de 4, valor 1 |
| Toast de traspaso completado, variante cian | Correcto |
| Grupo vacío: aviso y toast ámbar | Correcto |
| "Recibir" sin plugin nativo | Vuelve al menú, sin errores en consola |
| Línea gráfica: cian, grafito y tokens `--cp-*` | Correcto |
| Errores de JavaScript no capturados | Ninguno |

## Pruebas manuales

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Conectar dos teléfonos por Wi-Fi Direct desde Ajustes | Aparecen emparejados en la lista del sistema |
| 2 | Teléfono A: Traspaso Cerca → "Recibir en este teléfono" | Tarjeta "Esperando traspaso…" y toast "Listo para recibir…" |
| 3 | Teléfono B: "Enviar desde este teléfono" | En menos de 3 s aparece A en la lista con su nombre y su IP en azul |
| 4 | Marcar contenido y tocar el receptor | La barra de progreso avanza archivo por archivo |
| 5 | Fin del envío | A lista los archivos recibidos con su tamaño; B muestra el toast de completado |
| 6 | Salir de la pantalla en A y repetir el paso 2 | El puerto queda libre y el servidor vuelve a arrancar sin error |
| 7 | Teléfono B sin que A esté en "Recibir" | Toast ámbar "No se encontró ningún teléfono…" y botón "Buscar de nuevo" |

## Fuera de alcance

- **iOS.** Wi-Fi Direct no está disponible; el equivalente de Apple es Multipeer Connectivity y
  exige código nativo.
- **Reanudación automática** tras una desconexión a mitad de archivo. Un archivo interrumpido se
  vuelve a enviar entero.
- **Cifrado adicional a nivel de aplicación.** El grupo P2P ya usa WPA2.
- **Jerarquía de carpetas en el receptor.** Las carpetas se expanden y se envían archivo por
  archivo, pero el receptor los guarda todos planos en `Directory.Data/traspaso`. Si dos carpetas
  distintas tienen un archivo con el mismo nombre, el segundo sobrescribe al primero.
