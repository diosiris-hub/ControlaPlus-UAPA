/**
 * AppComponent — arranque del detector de red
 * ---------------------------------------------------------------------------
 * Inicializa NetworkService una sola vez al abrir la app. A partir de aquí
 * cualquier componente puede suscribirse a network.isOnline$.
 */
import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { NetworkService } from './core/network/network.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `<ion-app><ion-router-outlet></ion-router-outlet></ion-app>`,
})
export class AppComponent {
  private readonly network = inject(NetworkService);

  constructor() {
    // Network.getStatus() + Network.addListener('networkStatusChange', ...)
    this.network.init();
  }
}
