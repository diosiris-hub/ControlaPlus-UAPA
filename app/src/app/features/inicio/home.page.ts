/**
 * HomePage (versión del Entregable 2)
 * ---------------------------------------------------------------------------
 * Pantalla de inicio de Controla+: balance, movimientos recientes con la
 * etiqueta "⏳ Pendiente de sincronizar" y botón (+) para registrar un
 * movimiento. Todo el trabajo de red/almacenamiento vive en los servicios;
 * la página solo pinta y delega.
 */
import { Component, inject } from '@angular/core';
import { AsyncPipe, CurrencyPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import {
  AlertController,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add } from 'ionicons/icons';
import { NetworkStatusComponent } from '../../core/network/network-status.component';
import { MovimientosService } from '../../core/offline/movimientos.service';
import { Movimiento, TipoMovimiento } from '../../core/offline/movimiento.model';
import { MENSAJES } from '../../core/offline/mensajes';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    NgFor,
    NgIf,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonFab,
    IonFabButton,
    IonIcon,
    NetworkStatusComponent,
  ],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage {
  private readonly movimientos = inject(MovimientosService);
  private readonly alertCtrl = inject(AlertController);

  readonly lista$ = this.movimientos.movimientos$;
  readonly balance$ = this.movimientos.balance$;
  readonly etiquetaPendiente = MENSAJES.etiquetaPendiente;

  constructor() {
    addIcons({ add });
  }

  /** Formulario mínimo de registro (concepto + monto + tipo). */
  async nuevoMovimiento(): Promise<void> {
    const alerta = await this.alertCtrl.create({
      header: 'Nuevo movimiento',
      cssClass: 'alerta-controla',
      inputs: [
        { name: 'concepto', type: 'text', placeholder: 'Concepto (ej. Colmado Don José)' },
        { name: 'monto', type: 'number', placeholder: 'Monto en RD$', min: 1 },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Ingreso', handler: (d) => this.guardar(d, 'ingreso') },
        { text: 'Gasto', handler: (d) => this.guardar(d, 'gasto') },
      ],
    });
    await alerta.present();
  }

  private guardar(datos: { concepto?: string; monto?: string }, tipo: TipoMovimiento): boolean {
    const concepto = (datos.concepto ?? '').trim();
    const monto = Number(datos.monto);
    if (!concepto || !(monto > 0)) {
      return false; // mantiene la alerta abierta
    }
    void this.movimientos.registrar({ concepto, monto, tipo });
    return true;
  }

  trackById(_indice: number, m: Movimiento): string {
    return m.id;
  }
}
