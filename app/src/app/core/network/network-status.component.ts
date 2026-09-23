/**
 * NetworkStatusComponent — Entregable 1 · Indicador visual de conectividad
 * ---------------------------------------------------------------------------
 * Un solo componente con dos presentaciones, según el @Input `vista`:
 *
 *  - vista="pill"   → píldora ONLINE/OFFLINE (siempre visible en la barra
 *                     superior). Usa color + texto para ser comprensible
 *                     también por personas con daltonismo.
 *  - vista="banner" → banner rojo fijo mientras no hay conexión y banner cian
 *                     temporal (3 s) al recuperarla.
 *
 * Los textos salen del catálogo MENSAJES_RED, acordado en el documento de
 * diseño, para que UI y documentación usen siempre la misma redacción.
 */
import { Component, Input, inject } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { Observable, merge, of, timer } from 'rxjs';
import { filter, map, pairwise, startWith, switchMap } from 'rxjs/operators';
import { NetworkService } from './network.service';

export const MENSAJES_RED = {
  pillOnline: 'ONLINE',
  pillOffline: 'OFFLINE',
  bannerOfflineTitulo: 'Sin conexión a Internet',
  bannerOfflineTexto: 'Tus movimientos se guardarán y se sincronizarán cuando vuelva la conexión.',
  bannerReconexion: 'Conexión restablecida',
} as const;

/** Tiempo que permanece visible el banner "Conexión restablecida". */
export const DURACION_BANNER_RECONEXION_MS = 3000;

@Component({
  selector: 'app-network-status',
  standalone: true,
  imports: [AsyncPipe, NgIf],
  templateUrl: './network-status.component.html',
  styleUrls: ['./network-status.component.scss'],
})
export class NetworkStatusComponent {
  /** Presentación del indicador. */
  @Input() vista: 'pill' | 'banner' = 'pill';

  readonly mensajes = MENSAJES_RED;

  private readonly network = inject(NetworkService);

  /** true/false en tiempo real, alimentado por @capacitor/network. */
  readonly isOnline$: Observable<boolean> = this.network.isOnline$;

  /**
   * Emite true durante 3 s cada vez que se pasa de offline → online.
   * pairwise() entrega [estadoAnterior, estadoActual]; solo nos interesa la
   * transición false → true.
   */
  readonly reconectado$: Observable<boolean> = this.network.isOnline$.pipe(
    pairwise(),
    filter(([antes, ahora]) => !antes && ahora),
    switchMap(() => merge(of(true), timer(DURACION_BANNER_RECONEXION_MS).pipe(map(() => false)))),
    startWith(false),
  );
}
