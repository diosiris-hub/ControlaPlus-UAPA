/**
 * transfer-client.service.ts  (MODO EMISOR)
 * ---------------------------------------------------------------------------
 * Descubre al receptor en la red del grupo Wi-Fi Direct y le envía los
 * archivos seleccionados, todo con APIs de Capacitor (TypeScript puro).
 *
 * Descubrimiento: en Wi-Fi Direct, Android asigna siempre al Group Owner la IP
 * 192.168.49.1 y a los clientes IPs del rango 192.168.49.x. El emisor sondea
 * esas IPs en paralelo y se queda con las que contestan el saludo /info con la
 * firma de Controla+.
 */
import { Injectable } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';
import type { HttpResponse } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { BehaviorSubject } from 'rxjs';
import { FIRMA_APP, PUERTO_TRASPASO, bytesDeBase64 } from './transfer-server.service';

export interface Receptor {
  ip: string;
  dispositivo: string;
}

export interface Progreso {
  archivo: string;
  enviados: number;
  total: number;
}

/** Un archivo que no se pudo enviar, con el motivo para el resumen final. */
export interface FalloEnvio {
  archivo: string;
  motivo: string;
}

/** Espera máxima por IP durante el sondeo (ms). */
const TIMEOUT_SONDEO = 1500;

/** Espera máxima al subir un archivo (ms). Los recibos pesan decenas de MB. */
const TIMEOUT_ENVIO = 120000;

/** IPs candidatas dentro del grupo Wi-Fi Direct. */
export const IPS_GRUPO: readonly string[] = [
  '192.168.49.1',
  ...Array.from({ length: 20 }, (_, i) => `192.168.49.${i + 2}`),
];

@Injectable({ providedIn: 'root' })
export class TransferClientService {
  readonly receptores$ = new BehaviorSubject<Receptor[]>([]);
  readonly progreso$ = new BehaviorSubject<Progreso | null>(null);

  /** 1) "Descubrir" receptores Controla+ dentro del grupo. */
  async buscarReceptores(): Promise<Receptor[]> {
    this.receptores$.next([]);
    const hallados: Receptor[] = [];

    // Sondeo en paralelo: 21 IPs a la vez, no una detrás de otra. Con 1,5 s de
    // espera por IP el barrido completo termina en torno a ese mismo tiempo.
    await Promise.all(
      IPS_GRUPO.map(async (ip) => {
        const receptor = await this.saludar(ip);
        if (receptor) {
          hallados.push(receptor);
          // Se publica en cuanto aparece: la lista se va llenando en pantalla.
          this.receptores$.next([...hallados]);
        }
      }),
    );

    return hallados;
  }

  /**
   * GET /info contra una IP. Devuelve el receptor solo si responde 200 y la
   * firma es la de Controla+; cualquier otra cosa en la red se descarta.
   */
  private async saludar(ip: string): Promise<Receptor | null> {
    try {
      // connectTimeout y readTimeout solo los respeta la implementación NATIVA
      // de CapacitorHttp. En web se ignoran y la petición queda colgada hasta
      // que expira el TCP del sistema, que puede pasar del minuto. El límite
      // propio de conLimite() acota el sondeo en cualquier plataforma y es lo
      // que garantiza que la lista aparezca en menos de 3 s.
      const r = await conLimite(
        CapacitorHttp.get({
          url: `http://${ip}:${PUERTO_TRASPASO}/info`,
          connectTimeout: TIMEOUT_SONDEO,
          readTimeout: TIMEOUT_SONDEO,
        }),
        TIMEOUT_SONDEO,
      );

      if (r.status !== 200) {
        return null;
      }

      const body = leerJson(r);
      if (!body || body['app'] !== FIRMA_APP) {
        return null;
      }

      const dispositivo =
        typeof body['dispositivo'] === 'string' && body['dispositivo'].trim()
          ? (body['dispositivo'] as string)
          : 'Teléfono Controla+';

      return { ip, dispositivo };
    } catch {
      // IP sin respuesta: no es un receptor. Es el caso normal en 20 de 21 IPs.
      return null;
    }
  }

  /**
   * 2) Enviar los archivos seleccionados al receptor elegido.
   *
   * Las rutas se expanden antes de empezar: lo que el usuario marca como "Fotos
   * de recibos" es una carpeta, y el contrato HTTP envía archivos sueltos. Así
   * el total del progreso es el número real de archivos, no el de elementos
   * marcados en la lista.
   *
   * Los envíos son SECUENCIALES a propósito: mantienen el orden del progreso y
   * evitan que varios archivos de decenas de MB compitan por el enlace. Cada
   * archivo se envuelve en su propio try/catch, así que un fallo no cancela el
   * resto; los fallos se devuelven para que la página los resuma.
   */
  async enviarArchivos(receptor: Receptor, seleccion: string[]): Promise<FalloEnvio[]> {
    const fallos: FalloEnvio[] = [];
    const rutas = await this.expandir(seleccion, fallos);
    const total = rutas.length;

    if (total === 0) {
      this.progreso$.next({ archivo: 'completado', enviados: 0, total: 0 });
      return fallos;
    }

    for (let i = 0; i < total; i++) {
      const ruta = rutas[i];
      const nombre = ruta.split('/').pop() || ruta;

      // Progreso ANTES de empezar: la barra refleja "i de total ya enviados".
      this.progreso$.next({ archivo: nombre, enviados: i, total });

      try {
        await this.enviarUno(receptor, ruta, nombre);
      } catch (e) {
        fallos.push({ archivo: nombre, motivo: motivoDe(e) });
      }
    }

    this.progreso$.next({ archivo: 'completado', enviados: total, total });
    return fallos;
  }

  /**
   * Convierte la selección del usuario en una lista plana de archivos.
   * Lo que no es carpeta se deja tal cual; lo que sí lo es se recorre con
   * Filesystem.readdir(). Una carpeta ilegible se anota como fallo y no
   * interrumpe al resto de la selección.
   */
  private async expandir(seleccion: string[], fallos: FalloEnvio[]): Promise<string[]> {
    const archivos: string[] = [];

    for (const ruta of seleccion) {
      try {
        const contenido = await this.listar(ruta);
        archivos.push(...contenido);
      } catch (e) {
        fallos.push({ archivo: ruta.split('/').pop() || ruta, motivo: motivoDe(e) });
      }
    }

    return archivos;
  }

  /**
   * Archivos que cuelgan de una ruta, entrando en las subcarpetas.
   *
   * El tipo se consulta con stat(), NO probando si readdir() falla. Sobre un
   * archivo, readdir lanza excepción en Android pero devuelve una lista vacía
   * en la implementación web, y esa diferencia hacía que los archivos sueltos
   * se perdieran sin avisar: se expandían a cero elementos y no se enviaban.
   */
  private async listar(ruta: string): Promise<string[]> {
    let tipo: string;
    try {
      const info = await Filesystem.stat({ path: ruta, directory: Directory.Data });
      tipo = info.type;
    } catch {
      // No se puede consultar. Se trata como archivo: si tampoco existe, el
      // envío fallará y quedará anotado como un fallo concreto y visible.
      return [ruta];
    }

    if (tipo !== 'directory') {
      return [ruta];
    }

    const { files: entradas } = await Filesystem.readdir({
      path: ruta,
      directory: Directory.Data,
    });

    const archivos: string[] = [];
    for (const entrada of entradas) {
      // En Capacitor 5+ cada entrada trae nombre y tipo; en versiones viejas,
      // readdir devolvía cadenas sueltas.
      const nombre = typeof entrada === 'string' ? entrada : entrada.name;
      const esCarpeta = typeof entrada !== 'string' && entrada.type === 'directory';
      const hijo = `${ruta}/${nombre}`;
      if (esCarpeta) {
        archivos.push(...(await this.listar(hijo)));
      } else {
        archivos.push(hijo);
      }
    }
    return archivos;
  }

  /** Lee un archivo local y lo sube como sobre JSON { nombre, base64 }. */
  private async enviarUno(receptor: Receptor, ruta: string, nombre: string): Promise<void> {
    const file = await Filesystem.readFile({ path: ruta, directory: Directory.Data });

    // En nativo readFile devuelve string base64; en web puede devolver Blob.
    const base64 = typeof file.data === 'string' ? file.data : await blobABase64(file.data);

    const r = await CapacitorHttp.post({
      url: `http://${receptor.ip}:${PUERTO_TRASPASO}/upload`,
      headers: { 'Content-Type': 'application/json' },
      connectTimeout: TIMEOUT_SONDEO,
      readTimeout: TIMEOUT_ENVIO,
      data: JSON.stringify({ nombre, base64 }),
    });

    if (r.status < 200 || r.status >= 300) {
      throw new Error(`el receptor respondió ${r.status}`);
    }

    const body = leerJson(r);
    if (body && body['ok'] === false) {
      throw new Error('el receptor rechazó el archivo');
    }
  }

  /** Tamaño real de un archivo local, para mostrarlo en la lista de contenido. */
  async tamano(ruta: string): Promise<number> {
    try {
      const file = await Filesystem.readFile({ path: ruta, directory: Directory.Data });
      return typeof file.data === 'string' ? bytesDeBase64(file.data) : file.data.size;
    } catch {
      return 0;
    }
  }

  /** Reinicia el estado del emisor al volver al menú. */
  limpiar(): void {
    this.receptores$.next([]);
    this.progreso$.next(null);
  }
}

/**
 * CapacitorHttp ya entrega objeto cuando la respuesta es application/json, pero
 * devuelve string cuando el servidor no declara el tipo. Se cubren ambos casos.
 */
function leerJson(r: HttpResponse): Record<string, unknown> | null {
  const datos: unknown = r.data;
  if (datos && typeof datos === 'object') {
    return datos as Record<string, unknown>;
  }
  if (typeof datos === 'string') {
    try {
      const parseado: unknown = JSON.parse(datos);
      return parseado && typeof parseado === 'object'
        ? (parseado as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Convierte el Blob de Filesystem.readFile en web a base64 sin cabecera. */
function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('no se pudo leer el archivo'));
    lector.onload = () => {
      const resultado = String(lector.result);
      resolve(resultado.slice(resultado.indexOf(',') + 1));
    };
    lector.readAsDataURL(blob);
  });
}

/**
 * Acota una promesa en el tiempo. No cancela la petición subyacente, solo deja
 * de esperarla, que es justo lo que hace falta en el sondeo: de 21 IPs, 20 no
 * van a contestar nunca y no se puede depender del tiempo de espera del sistema.
 *
 * A propósito NO se usa en la subida de archivos: abandonar un envío de decenas
 * de MB que sigue viajando dejaría al receptor con un archivo a medias y sin
 * forma de saberlo. Ahí manda readTimeout, que en nativo sí se respeta.
 */
function conLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout>;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('tiempo de espera agotado')), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador)) as Promise<T>;
}

/** Mensaje corto y legible para el resumen de fallos. */
function motivoDe(e: unknown): string {
  if (e instanceof Error && e.message) {
    return e.message;
  }
  if (typeof e === 'string' && e) {
    return e;
  }
  return 'error desconocido';
}
