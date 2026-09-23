/**
 * ble-protocolo.ts — contrato de datos de Compartir Cerca (BLE).
 * ---------------------------------------------------------------------------
 * TypeScript puro: no depende de ningún plugin, así que lo comparten el rol
 * EMISOR (central) y el rol RECEPTOR (periférico) y se puede probar en web.
 *
 * Servicio GATT de Controla+:
 *   CARACT_MOVIMIENTO  (write)          el emisor escribe el movimiento troceado
 *   CARACT_RESPUESTA   (notify + read)  el receptor contesta con una RespuestaBle
 *
 * Un movimiento ocupa ~150 bytes en JSON, más que los 20 bytes útiles de una
 * escritura BLE con el MTU por defecto (23). Por eso el mensaje viaja en
 * paquetes con una cabecera de 2 bytes:
 *
 *   [ índice (0..total-1) ][ total (1..255) ][ datos UTF-8 ... ]
 *
 * Los UUID tienen que ir en minúsculas y en formato de 128 bits: el plugin
 * @capacitor-community/bluetooth-le rechaza cualquier otro formato.
 */
import { Movimiento, TipoMovimiento } from '../offline/movimiento.model';

/** Servicio que anuncia el receptor. El emisor filtra la búsqueda por él. */
export const CP_SERVICIO_UUID = 'c9a70001-5e2b-4c1f-9d3a-6b7e0c4f2a10';

/** El emisor escribe aquí los paquetes del movimiento. */
export const CARACT_MOVIMIENTO_UUID = 'c9a70002-5e2b-4c1f-9d3a-6b7e0c4f2a10';

/** El receptor notifica aquí si aceptó o rechazó. */
export const CARACT_RESPUESTA_UUID = 'c9a70003-5e2b-4c1f-9d3a-6b7e0c4f2a10';

/** Identificador de la app dentro del mensaje: el receptor lo exige. */
export const FIRMA_APP = 'ControlaPlus';

/** Versión del formato del mensaje. Sube si cambia algún campo. */
export const VERSION_PROTOCOLO = 1;

/** Límite del mensaje completo. Un movimiento real ronda los 150-250 bytes. */
export const LIMITE_MENSAJE_BYTES = 1024;

/** Largo máximo del concepto que se acepta al recibir. */
export const CONCEPTO_MAX = 80;

/** MTU por defecto de BLE: 23 bytes, de los que 3 son cabecera ATT. */
const MTU_MINIMO = 23;
const CABECERA_ATT = 3;
const CABECERA_PAQUETE = 2;

/** Lo que viaja entre los dos teléfonos. */
export interface MovimientoCompartido {
  v: number;
  app: string;
  /** id del movimiento en el teléfono de origen (solo informativo). */
  origenId: string;
  concepto: string;
  monto: number;
  tipo: TipoMovimiento;
  /** Fecha ISO 8601 original del movimiento. */
  fecha: string;
  /** Nombre visible del teléfono que envía. */
  de: string;
}

/** Respuestas que el receptor notifica por CARACT_RESPUESTA. */
export type RespuestaBle = 'aceptado' | 'rechazado' | 'duplicado' | 'invalido';

const RESPUESTAS: readonly RespuestaBle[] = ['aceptado', 'rechazado', 'duplicado', 'invalido'];

/** Arma el mensaje a partir de un movimiento local. */
export function crearMensaje(mov: Movimiento, de: string): MovimientoCompartido {
  return {
    v: VERSION_PROTOCOLO,
    app: FIRMA_APP,
    origenId: mov.id,
    concepto: mov.concepto,
    monto: mov.monto,
    tipo: mov.tipo,
    fecha: mov.fecha,
    de,
  };
}

/**
 * Valida lo recibido antes de mostrarlo o guardarlo. Devuelve null ante
 * cualquier dato inesperado: nada que no pase por aquí llega a la pantalla.
 */
export function validarMensaje(crudo: unknown): MovimientoCompartido | null {
  if (!crudo || typeof crudo !== 'object') {
    return null;
  }
  const m = crudo as Record<string, unknown>;

  if (m['app'] !== FIRMA_APP || m['v'] !== VERSION_PROTOCOLO) {
    return null;
  }
  if (typeof m['concepto'] !== 'string' || typeof m['fecha'] !== 'string') {
    return null;
  }
  const concepto = m['concepto'].trim();
  if (!concepto || concepto.length > CONCEPTO_MAX) {
    return null;
  }
  const monto = m['monto'];
  if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
    return null;
  }
  if (m['tipo'] !== 'gasto' && m['tipo'] !== 'ingreso') {
    return null;
  }
  if (Number.isNaN(Date.parse(m['fecha']))) {
    return null;
  }

  return {
    v: VERSION_PROTOCOLO,
    app: FIRMA_APP,
    origenId: typeof m['origenId'] === 'string' ? m['origenId'] : '',
    concepto,
    monto,
    tipo: m['tipo'],
    fecha: m['fecha'],
    de: typeof m['de'] === 'string' && m['de'].trim() ? m['de'].trim() : 'Teléfono Controla+',
  };
}

/** JSON → bytes UTF-8 (los conceptos llevan tildes y ñ). */
export function codificarMensaje(mensaje: MovimientoCompartido): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(mensaje));
  if (bytes.length > LIMITE_MENSAJE_BYTES) {
    throw new Error('el movimiento es demasiado grande para compartirlo');
  }
  return bytes;
}

/** Bytes UTF-8 → mensaje validado, o null si no es un movimiento válido. */
export function decodificarMensaje(bytes: Uint8Array): MovimientoCompartido | null {
  try {
    return validarMensaje(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/**
 * Parte el mensaje en paquetes que caben en una escritura BLE.
 * `mtu` es el valor negociado (BleClient.getMtu); en Android el plugin pide
 * 512 al conectar, pero si el otro lado no lo acepta se queda en 23.
 */
export function trocear(bytes: Uint8Array, mtu: number): Uint8Array[] {
  const util = Math.max(mtu, MTU_MINIMO) - CABECERA_ATT - CABECERA_PAQUETE;
  const total = Math.max(1, Math.ceil(bytes.length / util));
  if (total > 255) {
    throw new Error('el movimiento es demasiado grande para compartirlo');
  }

  const paquetes: Uint8Array[] = [];
  for (let i = 0; i < total; i++) {
    const datos = bytes.subarray(i * util, (i + 1) * util);
    const paquete = new Uint8Array(CABECERA_PAQUETE + datos.length);
    paquete[0] = i;
    paquete[1] = total;
    paquete.set(datos, CABECERA_PAQUETE);
    paquetes.push(paquete);
  }
  return paquetes;
}

/**
 * Junta los paquetes en el receptor. Un paquete con índice 0 siempre empieza
 * un mensaje nuevo, así que un envío cortado a medias no contamina al
 * siguiente. Un paquete fuera de orden descarta lo acumulado.
 */
export class Reensamblador {
  private partes: Uint8Array[] = [];
  private total = 0;

  /** Devuelve el mensaje completo cuando llega el último paquete; si no, null. */
  agregar(paquete: Uint8Array): Uint8Array | null {
    if (paquete.length < CABECERA_PAQUETE) {
      this.reiniciar();
      return null;
    }
    const indice = paquete[0];
    const total = paquete[1];

    if (indice === 0) {
      this.reiniciar();
      this.total = total;
    }
    if (total === 0 || total !== this.total || indice !== this.partes.length) {
      this.reiniciar();
      return null;
    }

    this.partes.push(paquete.subarray(CABECERA_PAQUETE));
    if (this.partes.length < this.total) {
      return null;
    }

    const largo = this.partes.reduce((acc, p) => acc + p.length, 0);
    const completo = new Uint8Array(largo);
    let desplazamiento = 0;
    for (const p of this.partes) {
      completo.set(p, desplazamiento);
      desplazamiento += p.length;
    }
    this.reiniciar();
    return completo.length <= LIMITE_MENSAJE_BYTES ? completo : null;
  }

  reiniciar(): void {
    this.partes = [];
    this.total = 0;
  }
}

export function codificarRespuesta(r: RespuestaBle): Uint8Array {
  return new TextEncoder().encode(r);
}

export function decodificarRespuesta(bytes: Uint8Array): RespuestaBle | null {
  const texto = new TextDecoder().decode(bytes).trim();
  return (RESPUESTAS as readonly string[]).includes(texto) ? (texto as RespuestaBle) : null;
}
