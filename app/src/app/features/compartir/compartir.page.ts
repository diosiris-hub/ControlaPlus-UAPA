/**
 * compartir.page.ts — Pantalla "Compartir Cerca" (BLE).
 * ---------------------------------------------------------------------------
 * Comparte UN movimiento entre dos teléfonos Controla+ por Bluetooth Low
 * Energy. Un teléfono pulsa "Recibir" y el otro "Enviar".
 *
 *   EMISOR:   elegir movimiento → buscar → tocar teléfono (conecta) →
 *             revisar la vista previa → Enviar → toast con la respuesta
 *   RECEPTOR: esperar → ver concepto, monto y fecha → Aceptar / Rechazar
 *
 * La página solo pinta y delega (BleEmisorService, BleReceptorService). El
 * estado es de señales por el mismo motivo que en Traspaso Cerca: con
 * Angular 22 sin Zone.js, asignar un campo después de un await no repinta.
 */
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { AsyncPipe, CurrencyPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { Capacitor } from '@capacitor/core';
import {
  arrowBackOutline,
  bluetoothOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { OfflineStorageService } from '../../core/offline/offline-storage.service';
import { Movimiento } from '../../core/offline/movimiento.model';
import { MovimientosService } from '../../core/offline/movimientos.service';
import { BleEmisorService, ReceptorBle } from '../../core/compartir/ble-emisor.service';
import { BleReceptorService } from '../../core/compartir/ble-receptor.service';
import { RespuestaBle } from '../../core/compartir/ble-protocolo';

type Modo = 'menu' | 'recibir' | 'enviar';

@Component({
  selector: 'app-compartir',
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
    IonNote,
    IonButton,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonSpinner,
  ],
  templateUrl: './compartir.page.html',
  styleUrls: ['./compartir.page.scss'],
})
export class CompartirPage implements OnDestroy {
  readonly emisor = inject(BleEmisorService);
  readonly receptor = inject(BleReceptorService);
  private readonly storage = inject(OfflineStorageService);
  private readonly movimientos = inject(MovimientosService);
  private readonly toastCtrl = inject(ToastController);

  /** Movimientos de este teléfono, para elegir cuál compartir. */
  readonly movimientos$ = this.storage.movimientos$;

  readonly modo = signal<Modo>('menu');
  readonly movimientoElegido = signal<Movimiento | undefined>(undefined);
  readonly buscando = signal(false);
  readonly conectando = signal(false);
  readonly enviando = signal(false);
  readonly decidiendo = signal(false);
  readonly modoPrueba = !Capacitor.isNativePlatform();

  private readonly errores: Subscription;

  constructor() {
    addIcons({ arrowBackOutline, bluetoothOutline, checkmarkCircleOutline, closeCircleOutline });

    this.errores = this.receptor.error$.subscribe((mensaje) => {
      if (mensaje) {
        void this.toast(mensaje, 'coral');
      }
    });
  }

  // ------------------------------------------------------------------ RECEPTOR

  async recibir(): Promise<void> {
    this.modo.set('recibir');
    this.receptor.limpiar();
    if (this.modoPrueba) {
      this.receptor.entrante$.next({
        v: 1,
        app: 'ControlaPlus',
        origenId: 'demo-recibido',
        concepto: 'Almuerzo de prueba',
        monto: 350,
        tipo: 'gasto',
        fecha: new Date().toISOString(),
        de: 'Teléfono de prueba',
      });
      await this.toast('Movimiento de ejemplo listo para aceptar o rechazar.');
      return;
    }
    try {
      await this.receptor.iniciarRecepcion();
      await this.toast('Listo para recibir. En el otro teléfono, pulsa "Enviar".');
    } catch {
      // El mensaje concreto ya llegó por error$; aquí solo se vuelve al menú.
      this.modo.set('menu');
    }
  }

  async aceptar(): Promise<void> {
    if (this.decidiendo()) {
      return;
    }
    this.decidiendo.set(true);
    try {
      if (this.modoPrueba) {
        const entrante = this.receptor.entrante$.getValue();
        if (entrante) {
          await this.movimientos.registrar({
            concepto: entrante.concepto,
            monto: entrante.monto,
            tipo: entrante.tipo,
          });
          this.receptor.entrante$.next(null);
          await this.toast('Movimiento de prueba agregado a Inicio.');
        }
        return;
      }
      const resultado = await this.receptor.aceptar();
      if (resultado === 'aceptado') {
        await this.toast('Movimiento agregado a tus registros.');
      } else {
        await this.toast('Ese movimiento ya estaba en tus registros; no se duplicó.', 'ambar');
      }
    } catch (e) {
      await this.toast(`No se pudo guardar el movimiento (${motivoDe(e)}).`, 'coral');
    } finally {
      this.decidiendo.set(false);
    }
  }

  async rechazar(): Promise<void> {
    if (this.decidiendo()) {
      return;
    }
    this.decidiendo.set(true);
    try {
      if (this.modoPrueba) {
        this.receptor.entrante$.next(null);
        await this.toast('Movimiento de prueba rechazado; no se guardó.', 'ambar');
        return;
      }
      await this.receptor.rechazar();
      await this.toast('Movimiento rechazado. No se guardó nada.', 'ambar');
    } finally {
      this.decidiendo.set(false);
    }
  }

  // ------------------------------------------------------------------- EMISOR

  enviarDesdeAqui(): void {
    this.modo.set('enviar');
    this.movimientoElegido.set(undefined);
  }

  elegir(m: Movimiento): void {
    if (this.enviando() || this.conectando()) {
      return;
    }
    this.movimientoElegido.set(m);
  }

  async buscar(): Promise<void> {
    if (this.buscando()) {
      return;
    }
    await this.emisor.limpiar();
    this.buscando.set(true);
    if (this.modoPrueba) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      this.emisor.receptores$.next([{ deviceId: 'controlaplus-demo', nombre: 'Teléfono de prueba' }]);
      this.buscando.set(false);
      await this.toast('Destinatario simulado disponible.');
      return;
    }
    try {
      const hallados = await this.emisor.buscarReceptores();
      if (hallados.length === 0) {
        await this.toast(
          'No se encontró ningún teléfono. Revisa que el Bluetooth esté encendido y que el otro esté en "Recibir".',
          'ambar',
        );
      }
    } catch (e) {
      await this.toast(`No se pudo buscar teléfonos cercanos (${motivoDe(e)}).`, 'coral');
    } finally {
      this.buscando.set(false);
    }
  }

  async conectar(r: ReceptorBle): Promise<void> {
    if (this.conectando() || this.enviando()) {
      return;
    }
    this.conectando.set(true);
    if (this.modoPrueba) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      this.emisor.conectado$.next(r);
      this.conectando.set(false);
      return;
    }
    try {
      await this.emisor.conectar(r);
    } catch (e) {
      await this.toast(`No se pudo conectar con ${r.nombre} (${motivoDe(e)}).`, 'coral');
    } finally {
      this.conectando.set(false);
    }
  }

  async enviar(): Promise<void> {
    const mov = this.movimientoElegido();
    const destino = this.emisor.conectado$.getValue();
    if (!mov || !destino || this.enviando()) {
      return;
    }

    this.enviando.set(true);
    if (this.modoPrueba) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      this.enviando.set(false);
      this.emisor.conectado$.next(null);
      await this.toast(`${destino.nombre} aceptó el movimiento (prueba simulada).`);
      return;
    }
    try {
      const respuesta = await this.emisor.enviarMovimiento(mov);
      await this.avisarRespuesta(respuesta, destino.nombre);
    } catch (e) {
      await this.toast(`No se pudo compartir el movimiento (${motivoDe(e)}).`, 'coral');
    } finally {
      this.enviando.set(false);
      await this.emisor.desconectar();
    }
  }

  private async avisarRespuesta(r: RespuestaBle, nombre: string): Promise<void> {
    switch (r) {
      case 'aceptado':
        await this.toast(`${nombre} aceptó el movimiento.`);
        break;
      case 'rechazado':
        await this.toast(`${nombre} rechazó el movimiento.`, 'ambar');
        break;
      case 'duplicado':
        await this.toast(`${nombre} ya tenía ese movimiento.`, 'ambar');
        break;
      case 'invalido':
        await this.toast(`${nombre} no pudo leer el movimiento.`, 'coral');
        break;
    }
  }

  // -------------------------------------------------------------------- común

  async volverAlMenu(): Promise<void> {
    await this.receptor.detener();
    this.receptor.limpiar();
    await this.emisor.limpiar();
    this.movimientoElegido.set(undefined);
    this.buscando.set(false);
    this.modo.set('menu');
  }

  trackPorId(_indice: number, m: Movimiento): string {
    return m.id;
  }

  trackPorDispositivo(_indice: number, r: ReceptorBle): string {
    return r.deviceId;
  }

  private async toast(message: string, variante: 'cian' | 'ambar' | 'coral' = 'cian'): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: 4000,
      position: 'bottom',
      cssClass: `toast-compartir toast-${variante}`,
    });
    await t.present();
  }

  /** Deja de anunciarse y cierra la conexión al salir de la pantalla. */
  ngOnDestroy(): void {
    this.errores.unsubscribe();
    void this.receptor.detener();
    void this.emisor.limpiar();
  }
}

function motivoDe(e: unknown): string {
  if (e instanceof Error && e.message) {
    return e.message;
  }
  if (typeof e === 'string' && e) {
    return e;
  }
  return 'error desconocido';
}
