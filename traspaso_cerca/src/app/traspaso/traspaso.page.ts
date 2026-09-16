/**
 * traspaso.page.ts — Pantalla "Traspaso Cerca" (Wi-Fi Direct, 100 % Ionic).
 * ---------------------------------------------------------------------------
 * El usuario forma el grupo desde Ajustes → Wi-Fi → Wi-Fi Direct; la app opera
 * sobre esa red: un teléfono pulsa "Recibir" y el otro "Enviar".
 *
 * La página solo pinta y delega: el servidor vive en TransferServerService y el
 * descubrimiento y la subida en TransferClientService. La barra de progreso se
 * alimenta de progreso$, nunca de estado local.
 *
 * ESTADO CON SEÑALES. Angular 22 detecta cambios sin Zone.js, y en ese modo la
 * simple asignación a un campo de la clase después de un await NO repinta la
 * vista: el sondeo terminaba pero el spinner se quedaba clavado en pantalla.
 * Las señales avisan al framework por sí mismas, así que la pantalla funciona
 * igual con Zone.js que sin él. Los observables de los servicios ya repintaban
 * bien porque el pipe async marca la vista por su cuenta.
 */
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { AsyncPipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import {
  IonButton,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonProgressBar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, documentOutline, wifiOutline } from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { TransferServerService } from '../services/transfer-server.service';
import { TransferClientService, Receptor } from '../services/transfer-client.service';

/** Un elemento seleccionable de la lista de contenido a traspasar. */
export interface ItemContenido {
  path: string;
  nombre: string;
  size: string;
  sel: boolean;
}

type Modo = 'menu' | 'recibir' | 'enviar';

@Component({
  selector: 'app-traspaso',
  standalone: true,
  imports: [
    AsyncPipe,
    DecimalPipe,
    NgFor,
    NgIf,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonNote,
    IonButton,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonCheckbox,
    IonSpinner,
    IonProgressBar,
  ],
  templateUrl: './traspaso.page.html',
  styleUrls: ['./traspaso.page.scss'],
})
export class TraspasoPage implements OnDestroy {
  readonly servidor = inject(TransferServerService);
  readonly cliente = inject(TransferClientService);
  private readonly toastCtrl = inject(ToastController);

  readonly modo = signal<Modo>('menu');
  readonly buscando = signal(false);
  readonly enviando = signal(false);
  readonly receptorElegido = signal<Receptor | undefined>(undefined);

  readonly contenido = signal<ItemContenido[]>([
    {
      path: 'respaldo_controla.json',
      nombre: 'Respaldo completo de movimientos',
      size: '2.4 MB',
      sel: true,
    },
    { path: 'recibos', nombre: 'Fotos de recibos (34)', size: '46.1 MB', sel: true },
    { path: 'agosto_2026.pdf', nombre: 'Reporte mensual PDF', size: '1.2 MB', sel: false },
  ]);

  /** Hay algo marcado para enviar. */
  readonly haySeleccion = computed(() => this.contenido().some((c) => c.sel));

  private readonly errores: Subscription;

  constructor() {
    addIcons({ arrowBackOutline, documentOutline, wifiOutline });

    // Los fallos del servidor se avisan con un toast, nunca por consola.
    this.errores = this.servidor.error$.subscribe((mensaje) => {
      if (mensaje) {
        void this.toast(mensaje, 'coral');
      }
    });
  }

  /** Marca o desmarca un elemento de la lista de contenido. */
  alternar(item: ItemContenido): void {
    this.contenido.update((lista) =>
      lista.map((c) => (c.path === item.path ? { ...c, sel: !c.sel } : c)),
    );
  }

  /** RECEPTOR: iniciar el servidor y quedar a la espera. */
  async recibir(): Promise<void> {
    this.modo.set('recibir');
    this.servidor.limpiar();
    try {
      await this.servidor.iniciarRecepcion();
      await this.toast('Listo para recibir. En el otro teléfono, pulsa "Enviar".');
    } catch {
      // El mensaje concreto ya llegó por error$; aquí solo se vuelve al menú.
      this.modo.set('menu');
    }
  }

  /** EMISOR: sondear el grupo en busca de receptores Controla+. */
  async buscar(): Promise<void> {
    this.modo.set('enviar');
    this.buscando.set(true);
    this.receptorElegido.set(undefined);
    this.cliente.limpiar();
    try {
      const hallados = await this.cliente.buscarReceptores();
      if (hallados.length === 0) {
        await this.toast(
          'No se encontró ningún teléfono. Revisa que ambos estén conectados por Wi-Fi Direct y que el otro esté en modo "Recibir".',
          'ambar',
        );
      }
    } catch {
      await this.toast('No se pudo buscar en el grupo Wi-Fi Direct.', 'coral');
    } finally {
      this.buscando.set(false);
    }
  }

  /** EMISOR: enviar la selección al receptor elegido. */
  async enviar(r: Receptor): Promise<void> {
    if (this.enviando()) {
      return;
    }

    const rutas = this.contenido()
      .filter((c) => c.sel)
      .map((c) => c.path);

    if (rutas.length === 0) {
      await this.toast('Marca al menos un elemento para traspasar.', 'ambar');
      return;
    }

    this.receptorElegido.set(r);
    this.enviando.set(true);
    try {
      const fallos = await this.cliente.enviarArchivos(r, rutas);

      if (fallos.length === 0) {
        await this.toast(`Traspaso completado hacia ${r.dispositivo}.`);
      } else if (fallos.length === rutas.length) {
        await this.toast(`No se pudo enviar nada hacia ${r.dispositivo}.`, 'coral');
      } else {
        const nombres = fallos.map((f) => f.archivo).join(', ');
        await this.toast(
          `Traspaso parcial: ${rutas.length - fallos.length} de ${rutas.length}. Quedó pendiente: ${nombres}.`,
          'ambar',
        );
      }
    } finally {
      this.enviando.set(false);
    }
  }

  /** Volver al menú: libera el puerto y reinicia el estado de ambos roles. */
  async volverAlMenu(): Promise<void> {
    await this.servidor.detener();
    this.servidor.limpiar();
    this.cliente.limpiar();
    this.receptorElegido.set(undefined);
    this.buscando.set(false);
    this.modo.set('menu');
  }

  trackPorRuta(_indice: number, item: ItemContenido): string {
    return item.path;
  }

  trackPorIp(_indice: number, r: Receptor): string {
    return r.ip;
  }

  trackPorNombre(indice: number, a: { nombre: string }): string {
    return `${indice}-${a.nombre}`;
  }

  private async toast(message: string, variante: 'cian' | 'ambar' | 'coral' = 'cian'): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: 4000,
      position: 'bottom',
      cssClass: `toast-traspaso toast-${variante}`,
    });
    await t.present();
  }

  /** Liberar el puerto al salir de la pantalla. */
  ngOnDestroy(): void {
    this.errores.unsubscribe();
    void this.servidor.detener();
  }
}
