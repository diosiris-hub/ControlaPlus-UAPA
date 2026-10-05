/**
 * SyncService — Entregable 2 · Sincronización automática
 * ---------------------------------------------------------------------------
 * Observa NetworkService y, cada vez que la conexión pasa de offline → online,
 * envía al servidor todos los movimientos pendientes. También se usa para los
 * reintentos programados cuando un envío falla.
 *
 * Reglas:
 *  - Nunca hay dos sincronizaciones en paralelo (bandera `sincronizando`).
 *  - Si falla, informa con un toast ámbar y reintenta a los 6 s mientras siga
 *    habiendo conexión.
 *  - Al terminar con éxito muestra "Sincronización completada: N ...".
 */
import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { filter, pairwise } from 'rxjs/operators';
import { NetworkService } from '../network/network.service';
import { OfflineStorageService } from './offline-storage.service';
import { ApiService } from './api.service';
import { DURACION_TOAST_MS, MENSAJES, REINTENTO_SYNC_MS } from './mensajes';
import { environment } from '../../../environments/environment';

export interface ResultadoSync {
  origen: string;
  enviados: number;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly network = inject(NetworkService);
  private readonly storage = inject(OfflineStorageService);
  private readonly api = inject(ApiService);
  private readonly toastCtrl = inject(ToastController);

  private sincronizando = false;
  private reintento?: ReturnType<typeof setTimeout>;

  private readonly resultadoSubject = new Subject<ResultadoSync>();
  /** Permite a la UI o a las pruebas observar cada intento. */
  readonly resultado$ = this.resultadoSubject.asObservable();

  constructor() {
    // Transición false → true = se recuperó la conexión.
    this.network.isOnline$
      .pipe(
        pairwise(),
        filter(([antes, ahora]) => !antes && ahora),
      )
      .subscribe(() => {
        void this.sincronizar('reconexión');
      });
  }

  /**
   * Envía los pendientes. Devuelve cuántos se sincronizaron.
   * Es seguro llamarlo en cualquier momento: si no hay conexión o no hay
   * pendientes, no hace nada.
   */
  async sincronizar(origen = 'manual'): Promise<number> {
    if (this.sincronizando || !this.network.isOnline) {
      return 0;
    }
    const pendientes = await this.storage.pendientes();
    if (!pendientes.length) {
      return 0;
    }

    this.sincronizando = true;
    console.log(`SyncService: enviando ${pendientes.length} pendiente(s) · origen: ${origen}`);
    try {
      await this.api.enviarMovimientos(pendientes);
      await this.storage.marcarSincronizados(pendientes.map((m) => m.id));
      const mensaje = environment.usarServidorSimulado
        ? `Prueba completada: ${pendientes.length} movimiento(s) aceptado(s) por la API simulada.`
        : MENSAJES.toastSyncOk(pendientes.length);
      await this.toast(mensaje, 'cian');
      this.resultadoSubject.next({ origen, enviados: pendientes.length });
      return pendientes.length;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      console.warn('SyncService: fallo al sincronizar →', mensaje);
      await this.toast(MENSAJES.toastSyncError, 'ambar');
      this.resultadoSubject.next({ origen, enviados: 0, error: mensaje });
      this.programarReintento();
      return 0;
    } finally {
      this.sincronizando = false;
    }
  }

  /** Reintenta en unos segundos (se cancela cualquier reintento previo). */
  programarReintento(): void {
    if (this.reintento) {
      clearTimeout(this.reintento);
    }
    this.reintento = setTimeout(() => {
      void this.sincronizar('reintento');
    }, REINTENTO_SYNC_MS);
  }

  private async toast(message: string, variante: 'cian' | 'ambar' | 'oscuro'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: DURACION_TOAST_MS,
      position: 'bottom',
      cssClass: ['toast-controla', `toast-${variante}`],
    });
    await toast.present();
  }
}
