/**
 * ble-emisor.service.ts  (ROL EMISOR · central BLE)
 * ---------------------------------------------------------------------------
 * Busca teléfonos Controla+ cercanos, se conecta a uno, le escribe el
 * movimiento en paquetes y espera su respuesta (aceptado / rechazado).
 *
 * Todo con @capacitor-community/bluetooth-le, que cubre por completo el rol
 * central. La búsqueda se filtra por CP_SERVICIO_UUID: solo aparecen teléfonos
 * que tengan Compartir Cerca abierto en modo "Recibir", igual que la firma
 * /info filtraba receptores en Traspaso Cerca.
 */
import { Injectable } from '@angular/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import type { ScanResult } from '@capacitor-community/bluetooth-le';
import { Device } from '@capacitor/device';
import { BehaviorSubject } from 'rxjs';
import { Movimiento } from '../offline/movimiento.model';
import {
  CARACT_MOVIMIENTO_UUID,
  CARACT_RESPUESTA_UUID,
  CP_SERVICIO_UUID,
  RespuestaBle,
  codificarMensaje,
  crearMensaje,
  decodificarRespuesta,
  trocear,
} from './ble-protocolo';

export interface ReceptorBle {
  deviceId: string;
  nombre: string;
  rssi?: number;
}

/** Duración de la búsqueda (ms). */
const DURACION_BUSQUEDA = 8000;

/** Espera máxima para conectar (ms). */
const TIMEOUT_CONEXION = 10000;

/**
 * Espera máxima por la respuesta (ms). Es larga a propósito: del otro lado
 * una persona tiene que leer el movimiento y decidir.
 */
const TIMEOUT_RESPUESTA = 60000;

@Injectable({ providedIn: 'root' })
export class BleEmisorService {
  readonly receptores$ = new BehaviorSubject<ReceptorBle[]>([]);

  /** Receptor conectado, o null. */
  readonly conectado$ = new BehaviorSubject<ReceptorBle | null>(null);

  private inicializado = false;
  private mtu = 23;
  private esperandoRespuesta?: (r: RespuestaBle) => void;

  /**
   * Pide los permisos (BLUETOOTH_SCAN y BLUETOOTH_CONNECT en Android 12+) y
   * comprueba que el Bluetooth esté encendido. Si está apagado, en Android
   * se ofrece el diálogo del sistema para activarlo.
   */
  async preparar(): Promise<void> {
    if (!this.inicializado) {
      await BleClient.initialize({ androidNeverForLocation: true });
      this.inicializado = true;
    }
    if (!(await BleClient.isEnabled())) {
      try {
        await BleClient.requestEnable();
      } catch {
        throw new Error('activa el Bluetooth para buscar teléfonos cercanos');
      }
    }
  }

  /** Busca receptores durante unos segundos. La lista se llena en vivo. */
  async buscarReceptores(duracion = DURACION_BUSQUEDA): Promise<ReceptorBle[]> {
    await this.preparar();
    this.receptores$.next([]);
    const hallados = new Map<string, ReceptorBle>();

    await BleClient.requestLEScan({ services: [CP_SERVICIO_UUID] }, (r: ScanResult) => {
      hallados.set(r.device.deviceId, {
        deviceId: r.device.deviceId,
        nombre: r.localName || r.device.name || 'Teléfono Controla+',
        rssi: r.rssi,
      });
      this.receptores$.next([...hallados.values()]);
    });

    await esperar(duracion);
    await BleClient.stopLEScan();
    return [...hallados.values()];
  }

  /** Conecta con el receptor y se suscribe a su característica de respuesta. */
  async conectar(receptor: ReceptorBle): Promise<void> {
    await this.desconectar();

    await BleClient.connect(
      receptor.deviceId,
      () => {
        // El otro teléfono cerró la pantalla o se alejó.
        this.conectado$.next(null);
      },
      { timeout: TIMEOUT_CONEXION },
    );

    try {
      // En Android el plugin pide MTU 512 al conectar; se usa lo que se negoció.
      this.mtu = await BleClient.getMtu(receptor.deviceId);
    } catch {
      this.mtu = 23;
    }

    await BleClient.startNotifications(
      receptor.deviceId,
      CP_SERVICIO_UUID,
      CARACT_RESPUESTA_UUID,
      (valor: DataView) => {
        const r = decodificarRespuesta(aBytes(valor));
        if (r && this.esperandoRespuesta) {
          this.esperandoRespuesta(r);
        }
      },
    );

    this.conectado$.next(receptor);
  }

  /**
   * Envía el movimiento y espera la decisión del otro teléfono. Los paquetes
   * van con write CON respuesta y en orden: garantiza que lleguen completos y
   * en secuencia, y con ~150 bytes la diferencia de velocidad no se nota.
   */
  async enviarMovimiento(mov: Movimiento): Promise<RespuestaBle> {
    const receptor = this.conectado$.getValue();
    if (!receptor) {
      throw new Error('no hay ningún teléfono conectado');
    }

    const mensaje = crearMensaje(mov, await nombreDelTelefono());
    const paquetes = trocear(codificarMensaje(mensaje), this.mtu);

    // Se prepara la espera ANTES de escribir, por si la respuesta llega
    // mientras todavía se está escribiendo el último paquete.
    const respuesta = new Promise<RespuestaBle>((resolver) => {
      this.esperandoRespuesta = resolver;
    });

    try {
      for (const paquete of paquetes) {
        await BleClient.write(
          receptor.deviceId,
          CP_SERVICIO_UUID,
          CARACT_MOVIMIENTO_UUID,
          new DataView(paquete.buffer, paquete.byteOffset, paquete.byteLength),
        );
      }
      return await conLimite(respuesta, TIMEOUT_RESPUESTA, 'el otro teléfono no respondió a tiempo');
    } finally {
      this.esperandoRespuesta = undefined;
    }
  }

  async desconectar(): Promise<void> {
    const receptor = this.conectado$.getValue();
    this.conectado$.next(null);
    if (!receptor) {
      return;
    }
    try {
      await BleClient.stopNotifications(receptor.deviceId, CP_SERVICIO_UUID, CARACT_RESPUESTA_UUID);
    } catch {
      /* Ya estaba desconectado. */
    }
    try {
      await BleClient.disconnect(receptor.deviceId);
    } catch {
      /* Ya estaba desconectado. */
    }
  }

  /** Detiene una búsqueda en curso y limpia la lista (al volver al menú). */
  async limpiar(): Promise<void> {
    try {
      await BleClient.stopLEScan();
    } catch {
      /* No había búsqueda activa o el plugin no está inicializado. */
    }
    await this.desconectar();
    this.receptores$.next([]);
  }
}

/** Nombre visible del teléfono, con reserva si el sistema no lo expone. */
export async function nombreDelTelefono(): Promise<string> {
  try {
    const info = await Device.getInfo();
    return info.name || info.model || 'Teléfono Controla+';
  } catch {
    return 'Teléfono Controla+';
  }
}

/** DataView del plugin → Uint8Array del protocolo. */
function aBytes(valor: DataView): Uint8Array {
  return new Uint8Array(valor.buffer, valor.byteOffset, valor.byteLength);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Acota una promesa en el tiempo (misma idea que en Traspaso Cerca). */
function conLimite<T>(promesa: Promise<T>, ms: number, mensaje: string): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout>;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error(mensaje)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador)) as Promise<T>;
}
