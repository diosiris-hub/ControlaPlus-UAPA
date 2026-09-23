/**
 * AppComponent — arranque del módulo de conectividad
 * ---------------------------------------------------------------------------
 *  - NetworkService.init(): consulta el estado inicial y escucha los cambios.
 *  - SyncService se inyecta aquí para que quede instanciado desde el inicio y
 *    su suscripción a offline → online esté activa aunque el usuario no haya
 *    abierto todavía ninguna pantalla que lo use.
 */
import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { NetworkService } from './core/network/network.service';
import { SyncService } from './core/offline/sync.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `<ion-app><ion-router-outlet></ion-router-outlet></ion-app>`,
})
export class AppComponent {
  private readonly network = inject(NetworkService);
  /** Instanciado a propósito: activa la sincronización automática. */
  private readonly sync = inject(SyncService);

  constructor() {
    void this.network.init();
    void this.sync; // evita el aviso de "propiedad no usada"
  }
}
