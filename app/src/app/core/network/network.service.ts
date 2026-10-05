/**
 * NetworkService — Entregable 1 · Detector de estado de red
 * ---------------------------------------------------------------------------
 * Envuelve el plugin @capacitor/network y expone el estado de conectividad
 * como un Observable para que cualquier componente o servicio de Controla+
 * reaccione en tiempo real (píldora ONLINE/OFFLINE, banners, sincronización).
 *
 * Responsabilidades:
 *  1. Consultar el estado inicial con Network.getStatus().
 *  2. Suscribirse a Network.addListener('networkStatusChange', ...).
 *  3. Publicar los cambios dentro de la zona de Angular (NgZone) para que la
 *     vista se actualice aunque el evento llegue desde código nativo.
 *  4. Liberar el listener al destruir el servicio.
 */
import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Network } from '@capacitor/network';
import type { ConnectionStatus, ConnectionType } from '@capacitor/network';
import type { PluginListenerHandle } from '@capacitor/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

/** Estado de red simplificado que consume el resto de la app. */
export interface EstadoRed {
  /** true si el dispositivo tiene conexión (WiFi o datos móviles). */
  connected: boolean;
  /** 'wifi' | 'cellular' | 'none' | 'unknown' */
  connectionType: ConnectionType;
}

@Injectable({ providedIn: 'root' })
export class NetworkService implements OnDestroy {
  /**
   * Fuente de verdad del estado. Arranca con navigator.onLine como mejor
   * suposición hasta que Network.getStatus() responda, para evitar un
   * parpadeo OFFLINE al abrir la app.
   */
  private readonly estadoSubject = new BehaviorSubject<EstadoRed>({
    connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
    connectionType: 'unknown',
  });

  private listener?: PluginListenerHandle;
  private inicializado = false;
  private modoOfflinePrueba = false;
  private conexionReal = typeof navigator !== 'undefined' ? navigator.onLine : true;

  /** Estado completo (conectado + tipo de conexión). */
  readonly estado$: Observable<EstadoRed> = this.estadoSubject.asObservable();

  /** Solo el booleano, sin repetir valores iguales consecutivos. */
  readonly isOnline$: Observable<boolean> = this.estado$.pipe(
    map((e) => e.connected),
    distinctUntilChanged(),
  );

  constructor(private readonly zone: NgZone) {}

  /**
   * Debe llamarse una sola vez al arrancar la app (AppComponent o
   * APP_INITIALIZER). Es idempotente.
   */
  async init(): Promise<void> {
    if (this.inicializado) {
      return;
    }
    this.inicializado = true;

    // 1) Estado inicial
    const status = await Network.getStatus();
    this.actualizar(status);

    // 2) Cambios en tiempo real (modo avión, pérdida de WiFi, datos móviles...)
    this.listener = await Network.addListener('networkStatusChange', (nuevoEstado) => {
      // El evento llega desde el puente nativo, fuera de la zona de Angular.
      this.zone.run(() => this.actualizar(nuevoEstado));
    });
  }

  /** Lectura síncrona del último estado conocido. */
  get isOnline(): boolean {
    return this.estadoSubject.value.connected;
  }

  get modoOfflineDePrueba(): boolean {
    return this.modoOfflinePrueba;
  }

  /** Último estado completo conocido. */
  get estado(): EstadoRed {
    return this.estadoSubject.value;
  }

  setModoOfflinePrueba(activo: boolean): void {
    this.modoOfflinePrueba = activo;
    this.estadoSubject.next({
      ...this.estadoSubject.value,
      connected: this.conexionReal && !this.modoOfflinePrueba,
    });
  }

  /** Fuerza una nueva consulta al sistema (útil tras volver del segundo plano). */
  async refrescar(): Promise<EstadoRed> {
    const status = await Network.getStatus();
    this.actualizar(status);
    return this.estado;
  }

  private actualizar(status: ConnectionStatus): void {
    console.log('Estado de red:', status.connected, '· tipo:', status.connectionType);
    this.conexionReal = status.connected;
    this.estadoSubject.next({
      connected: status.connected && !this.modoOfflinePrueba,
      connectionType: status.connectionType,
    });
  }

  ngOnDestroy(): void {
    this.listener?.remove();
  }
}
