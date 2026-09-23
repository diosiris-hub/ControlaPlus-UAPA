/**
 * ble-periferico.ts — contrato del rol PERIFÉRICO (receptor) de Compartir Cerca.
 * ---------------------------------------------------------------------------
 * @capacitor-community/bluetooth-le (8.3.0) solo implementa el rol CENTRAL:
 * buscar, conectar, leer, escribir y suscribirse a notificaciones. No expone
 * ninguna API para anunciarse (BluetoothLeAdvertiser) ni para levantar un
 * servidor GATT (BluetoothGattServer), y sin eso un teléfono no puede ser
 * encontrado ni recibir escrituras de otro teléfono.
 *
 * Por eso el receptor no habla con un plugin concreto sino con esta interfaz.
 * BleReceptorService ya tiene toda su lógica (reensamblar, validar, aceptar,
 * rechazar, guardar) escrita contra PerifericoBle; falta solo la pieza que
 * anuncia el servicio y recibe las escrituras.
 *
 * PERIFERICO_BLE resuelve a PerifericoCordova (cordova-plugin-bluetoothle
 * 6.7.4, ver periferico-cordova.ts). Fuera de Android, o sin el plugin, esa
 * implementación falla con MENSAJE_SIN_PERIFERICO igual que
 * PerifericoNoDisponible. Para cambiarla basta con sobrescribir el token:
 *
 *   { provide: PERIFERICO_BLE, useClass: OtroPeriferico }
 */
import { InjectionToken } from '@angular/core';
// Importación circular a propósito: periferico-cordova.ts usa los tipos de
// este archivo, y aquí solo se instancia dentro de la fábrica (en tiempo de
// inyección, no al cargar el módulo), así que el orden de carga no importa.
import { PerifericoCordova } from './periferico-cordova';

export interface OpcionesPeriferico {
  /** Nombre que verá el emisor en la lista de teléfonos cercanos. */
  nombre: string;
  servicio: string;
  /** Característica con permiso de escritura: aquí llegan los paquetes. */
  caracteristicaEscritura: string;
  /** Característica con notify + read: aquí se publica la respuesta. */
  caracteristicaRespuesta: string;
}

export interface PerifericoBle {
  /** true si el teléfono puede anunciarse por BLE (no todos pueden). */
  disponible(): Promise<boolean>;

  /**
   * Pide permisos, crea el servicio GATT y empieza a anunciarlo.
   * `alEscribir` recibe cada escritura en caracteristicaEscritura, en orden.
   */
  iniciar(opciones: OpcionesPeriferico, alEscribir: (valor: Uint8Array) => void): Promise<void>;

  /** Publica un valor en caracteristicaRespuesta (notify a los suscritos). */
  notificar(valor: Uint8Array): Promise<void>;

  /** Deja de anunciarse y cierra el servidor GATT. Idempotente. */
  detener(): Promise<void>;
}

/** Mensaje que ve el usuario mientras falte el rol periférico. */
export const MENSAJE_SIN_PERIFERICO =
  'Este teléfono todavía no puede recibir por Bluetooth: falta el componente receptor BLE.';

/** Reserva sin plugin: deja la app usable y el fallo a la vista. */
export class PerifericoNoDisponible implements PerifericoBle {
  async disponible(): Promise<boolean> {
    return false;
  }

  async iniciar(): Promise<void> {
    throw new Error(MENSAJE_SIN_PERIFERICO);
  }

  async notificar(): Promise<void> {
    throw new Error(MENSAJE_SIN_PERIFERICO);
  }

  async detener(): Promise<void> {
    /* Nada que detener. */
  }
}

export const PERIFERICO_BLE = new InjectionToken<PerifericoBle>('PERIFERICO_BLE', {
  providedIn: 'root',
  factory: () => new PerifericoCordova(),
});
