/**
 * HomePage (versión del Entregable 2)
 * ---------------------------------------------------------------------------
 * Pantalla de inicio de Controla+: balance, movimientos recientes con la
 * etiqueta "⏳ Pendiente de sincronizar" y botón (+) para registrar un
 * movimiento. Todo el trabajo de red/almacenamiento vive en los servicios;
 * la página solo pinta y delega.
 */
import { Component, inject, signal } from '@angular/core';
import { AsyncPipe, CurrencyPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import {
  AlertController,
  IonContent,
  IonButton,
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
import { add, cloudOfflineOutline, warningOutline } from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import { ToastController } from '@ionic/angular';
import { NetworkStatusComponent } from '../../core/network/network-status.component';
import { NetworkService } from '../../core/network/network.service';
import { ApiService } from '../../core/offline/api.service';
import { MovimientosService } from '../../core/offline/movimientos.service';
import { Movimiento, TipoMovimiento, UbicacionMovimiento } from '../../core/offline/movimiento.model';
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
    IonButton,
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
  private readonly toastCtrl = inject(ToastController);
  private readonly network = inject(NetworkService);
  private readonly api = inject(ApiService);
  private ubicacionCapturada?: UbicacionMovimiento;

  readonly modoOfflinePrueba = signal(this.network.modoOfflineDePrueba);
  readonly falloApiPrueba = signal(this.api.simularFallo);

  readonly lista$ = this.movimientos.movimientos$;
  readonly balance$ = this.movimientos.balance$;
  readonly etiquetaPendiente = MENSAJES.etiquetaPendiente;

  constructor() {
    addIcons({ add, cloudOfflineOutline, warningOutline });
  }

  alternarOfflinePrueba(): void {
    const activo = !this.modoOfflinePrueba();
    this.modoOfflinePrueba.set(activo);
    this.network.setModoOfflinePrueba(activo);
  }

  alternarFalloApi(): void {
    const activo = !this.falloApiPrueba();
    this.falloApiPrueba.set(activo);
    this.api.simularFallo = activo;
  }

  /** Formulario mínimo de registro (concepto + monto + tipo). */
  async nuevoMovimiento(): Promise<void> {
    this.ubicacionCapturada = undefined;
    const alerta = await this.alertCtrl.create({
      header: 'Nuevo movimiento',
      message: 'La ubicación es opcional. Puedes usar GPS o una coordenada de prueba.',
      cssClass: 'alerta-controla',
      inputs: [
        { name: 'concepto', type: 'text', placeholder: 'Concepto (ej. Colmado Don José)' },
        { name: 'monto', type: 'number', placeholder: 'Monto en RD$', min: 1 },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Capturar GPS',
          handler: async () => {
            await this.capturarGps();
            return false;
          },
        },
        {
          text: 'Ubicación demo',
          handler: () => {
            this.ubicacionCapturada = { latitud: 18.4861, longitud: -69.9312, simulada: true };
            void this.toast('Se usará una ubicación de prueba en Santo Domingo.');
            return false;
          },
        },
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
    void this.movimientos.registrar({ concepto, monto, tipo, ubicacion: this.ubicacionCapturada });
    this.ubicacionCapturada = undefined;
    return true;
  }

  private async capturarGps(): Promise<void> {
    try {
      const posicion = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
      this.ubicacionCapturada = {
        latitud: posicion.coords.latitude,
        longitud: posicion.coords.longitude,
      };
      await this.toast('Ubicación GPS capturada para este movimiento.');
    } catch {
      await this.toast('No se obtuvo el GPS. Puedes probar con "Ubicación demo".');
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3000, position: 'bottom' });
    await toast.present();
  }

  trackById(_indice: number, m: Movimiento): string {
    return m.id;
  }
}
