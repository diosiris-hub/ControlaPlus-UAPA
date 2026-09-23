/**
 * periferico-cordova.ts — PerifericoBle sobre cordova-plugin-bluetoothle 6.7.4.
 * ---------------------------------------------------------------------------
 * Solo para el RECEPTOR. El emisor sigue con @capacitor-community/bluetooth-le.
 * Los dos plugins conviven: paquetes Java y nombres JS distintos
 * (window.bluetoothle frente a BleClient).
 *
 * Detalles del plugin que este archivo resuelve (revisados en su código Android):
 *  - Los permisos no los pide solo: sin BLUETOOTH_CONNECT, openGattServer lanza
 *    SecurityException en Android 12+. Se piden antes de todo.
 *  - initialize() va ANTES de initializePeripheral(): es el único que asigna el
 *    adaptador interno que usan startAdvertising y notify.
 *  - startAdvertising se apaga a los 1000 ms salvo que se pase timeout: 0.
 *  - El anuncio tiene 31 bytes y el UUID de 128 bits ocupa 18: sin
 *    includeDeviceName: false e includeTxPowerLevel: false falla con
 *    "Too large data".
 *  - startAdvertising llama a setName() con el `name` recibido, que cambia el
 *    nombre Bluetooth del teléfono. Se le pasa el nombre ACTUAL del adaptador
 *    (getAdapterInfo) para que no cambie nada.
 *  - Las escrituras NO se confirman solas: cada writeRequested exige respond(),
 *    o el emisor se queda esperando hasta que expira la escritura.
 *  - notify() nunca llama a su success en Android: la confirmación llega por el
 *    flujo de initializePeripheral como status 'notificationSent'.
 *  - Los UUID de los eventos llegan en MAYÚSCULAS: se comparan sin distinguir.
 *  - Sus tipos TypeScript están desactualizados; se usan los tipos mínimos de
 *    abajo en lugar de su index.d.ts.
 */
import { Capacitor } from '@capacitor/core';
import { MENSAJE_SIN_PERIFERICO, OpcionesPeriferico, PerifericoBle } from './ble-periferico';

// ------------------------------------------------ tipos mínimos del plugin

/** Todo lo que el plugin devuelve es un objeto plano con estas claves. */
interface ResultadoCordova {
  status?: string;
  error?: string;
  message?: string;
  address?: string;
  name?: string;
  service?: string;
  characteristic?: string;
  requestId?: number;
  offset?: number;
  /** base64 */
  value?: string;
  responseNeeded?: boolean;
  hasPermission?: boolean;
  requestPermission?: boolean;
}

type Ok = (r: ResultadoCordova) => void;
type Err = (e: ResultadoCordova) => void;

interface CaracteristicaCordova {
  uuid: string;
  properties: Partial<Record<'read' | 'write' | 'notify', true>>;
  permissions: Partial<Record<'read' | 'write', true>>;
}

interface BluetoothLeCordova {
  initialize(ok: Ok, params: { request: boolean; statusReceiver: boolean }): void;
  getAdapterInfo(ok: Ok): void;
  hasPermissionBtConnect(ok: Ok, err: Err): void;
  requestPermissionBtConnect(ok: Ok, err: Err): void;
  hasPermissionBtAdvertise(ok: Ok, err: Err): void;
  requestPermissionBtAdvertise(ok: Ok, err: Err): void;
  initializePeripheral(ok: Ok, err: Err, params: { request: boolean }): void;
  addService(
    ok: Ok,
    err: Err,
    params: { service: string; characteristics: CaracteristicaCordova[] },
  ): void;
  removeAllServices(ok: Ok, err: Err): void;
  startAdvertising(
    ok: Ok,
    err: Err,
    params: {
      service: string;
      name: string;
      mode: 'lowLatency' | 'balanced' | 'lowPower';
      connectable: boolean;
      timeout: number;
      txPowerLevel: 'high' | 'medium' | 'low' | 'ultraLow';
      includeDeviceName: boolean;
      includeTxPowerLevel: boolean;
    },
  ): void;
  stopAdvertising(ok: Ok, err: Err): void;
  respond(
    ok: Ok,
    err: Err,
    params: { address: string; requestId: number; offset: number; value?: string },
  ): void;
  notify(
    ok: Ok,
    err: Err,
    params: { address: string; service: string; characteristic: string; value: string },
  ): void;
}

/** Espera máxima de cada paso de arranque (ms). Incluye diálogos de permisos. */
const TIMEOUT_PASO = 30000;

/** Espera máxima de la confirmación de una notificación (ms). */
const TIMEOUT_NOTIFICACION = 3000;

// ---------------------------------------------------------- implementación

export class PerifericoCordova implements PerifericoBle {
  private opciones?: OpcionesPeriferico;
  private alEscribir?: (valor: Uint8Array) => void;
  private activo = false;

  /** Emisor conectado: a él van las notificaciones y las respuestas. */
  private central?: string;

  /** Último valor de la característica de respuesta, por si el emisor la lee. */
  private ultimaRespuesta?: string;

  private notificacionPendiente?: { resolver: () => void; rechazar: (e: Error) => void };

  async disponible(): Promise<boolean> {
    return Capacitor.getPlatform() === 'android' && !!obtenerPlugin();
  }

  async iniciar(opciones: OpcionesPeriferico, alEscribir: (valor: Uint8Array) => void): Promise<void> {
    const ble = obtenerPlugin();
    if (!ble || Capacitor.getPlatform() !== 'android') {
      throw new Error(MENSAJE_SIN_PERIFERICO);
    }

    this.opciones = opciones;
    this.alEscribir = alEscribir;
    this.central = undefined;
    this.ultimaRespuesta = undefined;

    // 1) Permisos (Android 12+). En versiones anteriores has* devuelve true.
    await this.asegurarPermiso(ble, 'Connect');
    await this.asegurarPermiso(ble, 'Advertise');

    // 2) initialize(): asigna el adaptador interno. Si el Bluetooth está
    //    apagado, request: true muestra el diálogo del sistema para activarlo.
    const init = await paso<ResultadoCordova>((ok) =>
      ble.initialize(ok, { request: true, statusReceiver: false }),
    );
    if (init.status !== 'enabled') {
      throw new Error('activa el Bluetooth para poder recibir');
    }

    // 3) Servidor GATT. El mismo callback queda abierto y trae todos los
    //    eventos: el primero es { status: 'enabled' } y marca que está listo.
    await paso<void>((listo, fallo) => {
      let arrancado = false;
      ble.initializePeripheral(
        (evento) => {
          if (!arrancado) {
            arrancado = true;
            listo();
            return;
          }
          this.atender(ble, evento);
        },
        (e) => (arrancado ? undefined : fallo(e)),
        { request: false },
      );
    });

    // 4) Servicio de Controla+. removeAllServices primero: al volver a entrar
    //    en "Recibir" el servidor GATT es el mismo y el servicio seguiría ahí.
    await paso<ResultadoCordova>((ok, err) => ble.removeAllServices(ok, err));
    await paso<ResultadoCordova>((ok, err) =>
      ble.addService(ok, err, {
        service: opciones.servicio,
        characteristics: [
          {
            uuid: opciones.caracteristicaEscritura,
            properties: { write: true },
            permissions: { write: true },
          },
          {
            uuid: opciones.caracteristicaRespuesta,
            properties: { read: true, notify: true },
            permissions: { read: true },
          },
        ],
      }),
    );

    // 5) Anuncio. El nombre ACTUAL del adaptador evita que setName() lo cambie.
    const adaptador = await paso<ResultadoCordova>((ok) => ble.getAdapterInfo(ok));
    const nombreActual = adaptador.name || opciones.nombre;

    await paso<ResultadoCordova>((ok, err) =>
      ble.startAdvertising(ok, err, {
        service: opciones.servicio,
        name: nombreActual,
        mode: 'lowLatency',
        connectable: true,
        timeout: 0,
        txPowerLevel: 'high',
        includeDeviceName: false,
        includeTxPowerLevel: false,
      }),
    );

    this.activo = true;
  }

  /** Eventos del servidor GATT (flujo abierto de initializePeripheral). */
  private atender(ble: BluetoothLeCordova, e: ResultadoCordova): void {
    if (!this.activo || !this.opciones) {
      return;
    }

    switch (e.status) {
      case 'connected':
      case 'subscribed':
        this.central = e.address;
        break;

      case 'disconnected':
        if (e.address === this.central) {
          this.central = undefined;
        }
        break;

      case 'writeRequested':
        this.alRecibirEscritura(ble, e);
        break;

      case 'readRequested':
        if (e.address && e.requestId !== undefined) {
          void llamar((ok, err) =>
            ble.respond(ok, err, {
              address: e.address!,
              requestId: e.requestId!,
              offset: e.offset ?? 0,
              value: this.ultimaRespuesta,
            }),
          );
        }
        break;

      case 'notificationSent':
        this.notificacionPendiente?.resolver();
        this.notificacionPendiente = undefined;
        break;

      default:
        // El fallo de una notificación llega sin status y con error.
        if (e.error === 'notificationSent') {
          this.notificacionPendiente?.rechazar(
            new Error(e.message || 'no se pudo avisar al otro teléfono'),
          );
          this.notificacionPendiente = undefined;
        }
    }
  }

  private alRecibirEscritura(ble: BluetoothLeCordova, e: ResultadoCordova): void {
    if (!e.address || e.requestId === undefined) {
      return;
    }
    this.central = e.address;

    // Se confirma SIEMPRE, también una escritura a otra característica: si
    // no, el emisor queda bloqueado esperando la respuesta ATT.
    if (e.responseNeeded) {
      void llamar((ok, err) =>
        ble.respond(ok, err, {
          address: e.address!,
          requestId: e.requestId!,
          offset: e.offset ?? 0,
        }),
      );
    }

    if (!mismoUuid(e.characteristic, this.opciones!.caracteristicaEscritura) || !e.value) {
      return;
    }
    this.alEscribir?.(base64ABytes(e.value));
  }

  async notificar(valor: Uint8Array): Promise<void> {
    const ble = obtenerPlugin();
    if (!ble || !this.activo || !this.opciones) {
      throw new Error(MENSAJE_SIN_PERIFERICO);
    }
    if (!this.central) {
      throw new Error('el otro teléfono ya se desconectó');
    }

    const value = bytesABase64(valor);
    this.ultimaRespuesta = value;

    // Un aviso por vez: el anterior, si seguía pendiente, se da por perdido.
    this.notificacionPendiente?.rechazar(new Error('aviso reemplazado'));

    const confirmada = new Promise<void>((resolver, rechazar) => {
      this.notificacionPendiente = { resolver, rechazar };
    });

    ble.notify(
      // En Android no se llama; en otras plataformas sí.
      () => {
        this.notificacionPendiente?.resolver();
        this.notificacionPendiente = undefined;
      },
      (e) => {
        this.notificacionPendiente?.rechazar(new Error(e.message || 'no se pudo avisar al otro teléfono'));
        this.notificacionPendiente = undefined;
      },
      {
        address: this.central,
        service: this.opciones.servicio,
        characteristic: this.opciones.caracteristicaRespuesta,
        value,
      },
    );

    try {
      await conLimite(confirmada, TIMEOUT_NOTIFICACION, 'el otro teléfono no confirmó el aviso');
    } finally {
      this.notificacionPendiente = undefined;
    }
  }

  async detener(): Promise<void> {
    const ble = obtenerPlugin();
    const estabaActivo = this.activo;
    this.activo = false;
    this.alEscribir = undefined;
    this.central = undefined;
    this.notificacionPendiente?.rechazar(new Error('recepción detenida'));
    this.notificacionPendiente = undefined;

    if (!ble || !estabaActivo) {
      return;
    }
    // Cada paso por separado: que falle uno no impide el otro.
    await llamar((ok, err) => ble.stopAdvertising(ok, err));
    await llamar((ok, err) => ble.removeAllServices(ok, err));
  }

  /** hasPermissionBtX → si falta, requestPermissionBtX. */
  private async asegurarPermiso(ble: BluetoothLeCordova, cual: 'Connect' | 'Advertise'): Promise<void> {
    const tiene = await paso<ResultadoCordova>((ok, err) =>
      cual === 'Connect' ? ble.hasPermissionBtConnect(ok, err) : ble.hasPermissionBtAdvertise(ok, err),
    );
    if (tiene.hasPermission) {
      return;
    }
    const pedido = await paso<ResultadoCordova>((ok, err) =>
      cual === 'Connect'
        ? ble.requestPermissionBtConnect(ok, err)
        : ble.requestPermissionBtAdvertise(ok, err),
    );
    if (!pedido.requestPermission) {
      throw new Error(
        cual === 'Connect'
          ? 'se necesita el permiso de dispositivos cercanos para recibir'
          : 'se necesita el permiso para anunciarse por Bluetooth',
      );
    }
  }
}

// ---------------------------------------------------------------- utilidades

/** window.bluetoothle lo expone el plugin (clobbers en su plugin.xml). */
function obtenerPlugin(): BluetoothLeCordova | undefined {
  return (globalThis as { bluetoothle?: BluetoothLeCordova }).bluetoothle;
}

/**
 * Convierte una llamada de callbacks en promesa, con límite de tiempo. Los
 * errores del plugin son objetos { error, message }: se pasan a Error.
 */
function paso<T>(llamada: (ok: (r: T) => void, err: Err) => void): Promise<T> {
  const promesa = new Promise<T>((resolver, rechazar) => {
    llamada(resolver, (e) => rechazar(new Error(e?.message || e?.error || 'error del Bluetooth')));
  });
  return conLimite(promesa, TIMEOUT_PASO, 'el Bluetooth no respondió a tiempo');
}

/** Como paso(), pero sin propagar el fallo (respuestas y limpieza). */
async function llamar(llamada: (ok: Ok, err: Err) => void): Promise<void> {
  try {
    await paso<ResultadoCordova>(llamada);
  } catch {
    /* El emisor ya se fue o no había nada que detener. */
  }
}

function mismoUuid(a: string | undefined, b: string): boolean {
  return !!a && a.toLowerCase() === b.toLowerCase();
}

function base64ABytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

function bytesABase64(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) {
    binario += String.fromCharCode(b);
  }
  return btoa(binario);
}

function conLimite<T>(promesa: Promise<T>, ms: number, mensaje: string): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout>;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error(mensaje)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador)) as Promise<T>;
}
