/**
 * HomePage (versión del Entregable 1)
 * ---------------------------------------------------------------------------
 * Muestra la píldora de estado en la barra superior y los banners debajo.
 * También expone el tipo de conexión (wifi / cellular / none) como dato de
 * apoyo para las pruebas con modo avión.
 */
import { Component, inject } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCardContent,
} from '@ionic/angular';
import { NetworkService } from '../core/network/network.service';
import { NetworkStatusComponent } from '../core/network/network-status.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    AsyncPipe,
    NgIf,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonCardContent,
    NetworkStatusComponent,
  ],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage {
  private readonly network = inject(NetworkService);

  /** Estado completo para mostrar en pantalla durante las pruebas. */
  readonly estado$ = this.network.estado$;
}
