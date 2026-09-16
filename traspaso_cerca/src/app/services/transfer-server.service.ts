/**
 * transfer-server.service.ts  (MODO RECEPTOR)
 * ---------------------------------------------------------------------------
 * Mini servidor HTTP que corre DENTRO de la app Ionic del teléfono receptor,
 * sobre la red del grupo Wi-Fi Direct formado por el sistema operativo.
 *
 * El grupo P2P NO lo crea la app: el usuario empareja los dos teléfonos en
 * Ajustes → Wi-Fi → Wi-Fi Direct y Android levanta la subred 192.168.49.0/24.
 * A partir de ahí esto es HTTP normal y corriente, por lo que el único permiso
 * necesario es android.permission.INTERNET.
 *
 * Contrato servido (ver README, sección "Contrato HTTP"):
 *   GET  /info    → { app: 'ControlaPlus', dispositivo: '<nombre>' }
 *   POST /upload  → { ok: true }   cuerpo: { nombre, base64 }
 *   *              → 404
 */
import { Injectable } from '@angular/core';
import { WebServer } from '@awesome-cordova-plugins/web-server/ngx';
// Tipos reales del plugin. Conviene importarlos en lugar de redeclararlos: en
// una petición entrante, headers es una cadena, no un diccionario.
import type { Request as PeticionWebServer } from '@awesome-cordova-plugins/web-server/ngx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Device } from '@capacitor/device';
import { BehaviorSubject } from 'rxjs';
import type { Subscription } from 'rxjs';

/** Puerto del traspaso. Lo comparten receptor y emisor. */
export const PUERTO_TRASPASO = 8988;

/** Identificador de la app en el saludo /info: el emisor lo exige. */
export const FIRMA_APP = 'ControlaPlus';

/** Subcarpeta de Directory.Data donde aterrizan los archivos recibidos. */
export const CARPETA_TRASPASO = 'traspaso';

export interface ArchivoRecibido {
  nombre: string;
  bytes: number;
  fecha: string;
}

@Injectable({ providedIn: 'root' })
export class TransferServerService {
  /** Archivos que van llegando (alimenta la lista de la UI). */
  readonly recibidos$ = new BehaviorSubject<ArchivoRecibido[]>([]);

  /** Errores del receptor para que la página los muestre como toast. */
  readonly error$ = new BehaviorSubject<string | null>(null);

  escuchando = false;

  private suscripcion?: Subscription;
  private nombreDispositivo = 'Teléfono Controla+';

  constructor(private readonly server: WebServer) {}

  /**
   * Iniciar el modo "Recibir": abre el servidor en el puerto 8988 y queda a la
   * espera. Es idempotente: pulsar "Recibir" dos veces no abre dos servidores.
   */
  async iniciarRecepcion(): Promise<void> {
    if (this.escuchando) {
      return;
    }

    // Se marca antes de los await para que dos toques seguidos no se solapen.
    this.escuchando = true;
    this.error$.next(null);

    try {
      this.nombreDispositivo = await this.obtenerNombre();

      // El manejador de error es obligatorio: si el plugin nativo no está (por
      // ejemplo al abrir la app en el navegador con ionic serve), el observable
      // falla y sin esta rama RxJS lo lanza como error no capturado.
      this.suscripcion = this.server.onRequest().subscribe({
        next: (data: PeticionWebServer) => void this.atender(data),
        error: (e: unknown) =>
          this.error$.next(this.describir(e, 'El servidor de recepción dejó de escuchar.')),
      });

      await this.server.start(PUERTO_TRASPASO);
    } catch (e) {
      // Puerto ocupado, plugin ausente o servidor ya arrancado: revertir estado.
      this.escuchando = false;
      this.suscripcion?.unsubscribe();
      this.suscripcion = undefined;
      this.error$.next(this.describir(e, 'No se pudo abrir el puerto de recepción.'));
      throw e;
    }
  }

  /**
   * Enruta cada petición entrante según el contrato HTTP del módulo.
   * El método también forma parte del contrato: /info es GET y /upload es POST.
   * Cualquier otra combinación cae en el 404, igual que una ruta desconocida.
   */
  private async atender(data: PeticionWebServer): Promise<void> {
    try {
      if (data.path === '/info' && data.method === 'GET') {
        await this.responderInfo(data.requestId);
      } else if (data.path === '/upload' && data.method === 'POST') {
        await this.recibirArchivo(data);
      } else {
        await this.server.sendResponse(data.requestId, { status: 404, body: '', headers: {} });
      }
    } catch (e) {
      this.error$.next(this.describir(e, 'Error al atender una petición del emisor.'));
      // Nunca se deja al emisor esperando: se responde 500 aunque algo falle.
      await this.responderFallo(data.requestId);
    }
  }

  /** El emisor usa esta ruta para "descubrir" al receptor dentro del grupo. */
  private async responderInfo(requestId: string): Promise<void> {
    await this.server.sendResponse(requestId, {
      status: 200,
      body: JSON.stringify({ app: FIRMA_APP, dispositivo: this.nombreDispositivo }),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** Guarda el archivo en Directory.Data/traspaso y lo publica en la lista. */
  private async recibirArchivo(data: PeticionWebServer): Promise<void> {
    const sobre = this.leerSobre(data.body);

    if (!sobre) {
      await this.server.sendResponse(data.requestId, {
        status: 400,
        body: JSON.stringify({ ok: false, error: 'Cuerpo inválido' }),
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }

    await Filesystem.writeFile({
      path: `${CARPETA_TRASPASO}/${sobre.nombre}`,
      data: sobre.base64,
      directory: Directory.Data,
      recursive: true,
    });

    const lista = this.recibidos$.getValue();
    this.recibidos$.next([
      ...lista,
      {
        nombre: sobre.nombre,
        bytes: bytesDeBase64(sobre.base64),
        fecha: new Date().toISOString(),
      },
    ]);

    await this.server.sendResponse(data.requestId, {
      status: 200,
      body: '{"ok":true}',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Valida el sobre { nombre, base64 } antes de escribir nada en disco.
   * Sanea el nombre para que un emisor no pueda escribir fuera de la carpeta
   * de traspaso con rutas del tipo "../../otra_cosa".
   */
  private leerSobre(body?: string): { nombre: string; base64: string } | null {
    if (!body) {
      return null;
    }
    try {
      const crudo = JSON.parse(body) as { nombre?: unknown; base64?: unknown };
      if (typeof crudo.nombre !== 'string' || typeof crudo.base64 !== 'string') {
        return null;
      }
      const nombre = sanearNombre(crudo.nombre);
      return nombre ? { nombre, base64: crudo.base64 } : null;
    } catch {
      return null;
    }
  }

  private async responderFallo(requestId: string): Promise<void> {
    try {
      await this.server.sendResponse(requestId, {
        status: 500,
        body: JSON.stringify({ ok: false }),
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      /* El emisor ya cortó: no hay nada que hacer. */
    }
  }

  /** Nombre visible del teléfono, con reserva si el sistema no lo expone. */
  private async obtenerNombre(): Promise<string> {
    try {
      const info = await Device.getInfo();
      return info.name || info.model || 'Teléfono Controla+';
    } catch {
      return 'Teléfono Controla+';
    }
  }

  private describir(e: unknown, porDefecto: string): string {
    const detalle = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
    return detalle ? `${porDefecto} (${detalle})` : porDefecto;
  }

  /** Detener el servidor al salir de la pantalla (libera el puerto 8988). */
  async detener(): Promise<void> {
    if (!this.escuchando) {
      return;
    }
    this.escuchando = false;
    this.suscripcion?.unsubscribe();
    this.suscripcion = undefined;
    try {
      await this.server.stop();
    } catch (e) {
      this.error$.next(this.describir(e, 'No se pudo detener el servidor.'));
    }
  }

  /** Vacía la lista de recibidos (al volver al menú). */
  limpiar(): void {
    this.recibidos$.next([]);
    this.error$.next(null);
  }
}

/**
 * Tamaño real en bytes de una cadena base64, descontando el relleno '='.
 * (4 caracteres base64 == 3 bytes.)
 */
export function bytesDeBase64(base64: string): number {
  const limpio = base64.replace(/[\r\n]/g, '');
  if (!limpio) {
    return 0;
  }
  const relleno = limpio.endsWith('==') ? 2 : limpio.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((limpio.length * 3) / 4) - relleno);
}

/**
 * Deja solo el nombre del archivo: sin rutas, sin '..', sin separadores.
 * Se conservan letras acentuadas y ñ (clases \p{L} y \p{N} con la bandera u),
 * porque los recibos de Controla+ se nombran en español.
 */
export function sanearNombre(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? '';
  const limpio = base.replace(/[^\p{L}\p{N}._\- ]+/gu, '_').trim();
  return limpio === '' || limpio === '.' || limpio === '..' ? '' : limpio;
}
