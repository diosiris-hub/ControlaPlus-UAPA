/**
 * MovimientosService — Entregable 2 · Lógica condicional online / offline
 * ---------------------------------------------------------------------------
 * Punto de entrada para registrar un movimiento desde la interfaz.
 *
 *   1. Guardar SIEMPRE en el dispositivo con estado 'pendiente'.
 *   2. Si NO hay conexión → toast amigable y terminar. El movimiento queda
 *      con la etiqueta "⏳ Pendiente de sincronizar" hasta que SyncService lo
 *      envíe al recuperar la conexión.
 *   3. Si HAY conexión → enviar al servidor y marcar 'sincronizado'. Si el
 *      envío falla, queda pendiente y se programa un reintento.
 */
import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { NetworkService } from '../network/network.service';
import { OfflineStorageService } from './offline-storage.service';
import { ApiService } from './api.service';
import { SyncService } from './sync.service';
import { DURACION_TOAST_MS, MENSAJES } from './mensajes';
import { Movimiento, NuevoMovimiento, generarId } from './movimiento.model';
import { environment } from '../../../environments/environment';

/** Saldo previo a los movimientos registrados (demo). */
const BALANCE_BASE = 21580;

@Injectable({ providedIn: 'root' })
export class MovimientosService {
  private readonly network = inject(NetworkService);
  private readonly storage = inject(OfflineStorageService);
  private readonly api = inject(ApiService);
  private readonly sync = inject(SyncService);
  private readonly toastCtrl = inject(ToastController);

  /** Lista reactiva para la vista (más reciente primero). */
  readonly movimientos$: Observable<Movimiento[]> = this.storage.movimientos$;

  /** Balance calculado con todos los movimientos locales, pendientes incluidos. */
  readonly balance$: Observable<number> = this.movimientos$.pipe(
    map((lista) =>
      lista.reduce((acc, m) => acc + (m.tipo === 'ingreso' ? m.monto : -m.monto), BALANCE_BASE),
    ),
  );

  /** Cuántos movimientos esperan sincronización. */
  readonly pendientes$: Observable<number> = this.movimientos$.pipe(
    map((lista) => lista.filter((m) => m.estado === 'pendiente').length),
  );

  async registrar(datos: NuevoMovimiento): Promise<Movimiento> {
    const movimiento: Movimiento = {
      id: generarId(),
      concepto: datos.concepto.trim(),
      monto: datos.monto,
      tipo: datos.tipo,
      fecha: new Date().toISOString(),
      ubicacion: datos.ubicacion,
      estado: 'pendiente',
    };

    // 1) Siempre primero en el dispositivo (offline-first)
    await this.storage.agregar(movimiento);

    // 2) Sin conexión: queda en cola y se avisa al usuario
    if (!this.network.isOnline) {
      console.log('Offline: movimiento guardado localmente como pendiente', movimiento.id);
      await this.toast(MENSAJES.toastGuardadoOffline, 'oscuro');
      return movimiento;
    }

    // 3) Con conexión: enviar y marcar como sincronizado
    try {
      await this.api.enviarMovimientos([movimiento]);
      await this.storage.marcarSincronizados([movimiento.id]);
      await this.toast(
        environment.usarServidorSimulado ? 'Registro completado con API simulada (POST).' : MENSAJES.toastEnviadoOnline,
        'cian',
      );
    } catch (err) {
      console.warn('Fallo al enviar estando en línea; queda pendiente →', err);
      await this.toast(MENSAJES.toastSyncError, 'ambar');
      this.sync.programarReintento();
    }
    return movimiento;
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
