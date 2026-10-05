/**
 * Modelo de datos del módulo offline.
 * ---------------------------------------------------------------------------
 * Cada movimiento lleva un campo `estado` que indica si ya llegó al servidor.
 * Ese campo es lo que permite mostrar la etiqueta "⏳ Pendiente de sincronizar"
 * y construir la cola de sincronización sin una estructura aparte.
 */
export type TipoMovimiento = 'gasto' | 'ingreso';

export type EstadoSincronizacion = 'pendiente' | 'sincronizado';

export interface UbicacionMovimiento {
  latitud: number;
  longitud: number;
  simulada?: boolean;
}

export interface Movimiento {
  /** UUID generado en el dispositivo: el servidor lo usa para no duplicar. */
  id: string;
  concepto: string;
  monto: number;
  tipo: TipoMovimiento;
  /** Fecha ISO 8601 de creación en el dispositivo. */
  fecha: string;
  ubicacion?: UbicacionMovimiento;
  estado: EstadoSincronizacion;
}

/** Datos que introduce el usuario en el formulario. */
export interface NuevoMovimiento {
  concepto: string;
  monto: number;
  tipo: TipoMovimiento;
  ubicacion?: UbicacionMovimiento;
}

/** Genera un identificador único en el cliente (idempotencia en el servidor). */
export function generarId(): string {
  const cripto = (globalThis as { crypto?: Crypto }).crypto;
  if (cripto && typeof cripto.randomUUID === 'function') {
    return cripto.randomUUID();
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
