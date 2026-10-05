import { Component, inject, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { ApiService, ConsultaQr } from '../../core/offline/api.service';
import { MovimientosService } from '../../core/offline/movimientos.service';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { qrCodeOutline } from 'ionicons/icons';

@Component({
  selector: 'app-qr',
  standalone: true,
  imports: [NgIf, IonButton, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar],
  templateUrl: './qr.page.html',
  styleUrls: ['./qr.page.scss'],
})
export class QrPage {
  readonly procesando = signal(false);
  readonly resultado = signal('');
  readonly mensaje = signal('');
  readonly enlaceQr = signal<string | null>(null);
  readonly modoWeb = !Capacitor.isNativePlatform();

  private readonly api = inject(ApiService);
  private readonly movimientos = inject(MovimientosService);
  readonly consulta = signal('');
  readonly consultaDatos = signal<ConsultaQr | null>(null);

  constructor() {
    addIcons({ qrCodeOutline });
  }

  async escanear(): Promise<void> {
    if (this.procesando()) {
      return;
    }

    this.procesando.set(true);
    this.resultado.set('');
    this.mensaje.set('');
    this.enlaceQr.set(null);
    this.consulta.set('');
    this.consultaDatos.set(null);

    try {
      const plataforma = Capacitor.getPlatform();
      if (plataforma !== 'android' && plataforma !== 'ios') {
        const codigo = JSON.stringify({ app: 'ControlaPlus', tipo: 'gasto', concepto: 'Compra QR de prueba', monto: 250 });
        this.resultado.set(codigo);
        await this.consultar(codigo);
        this.mensaje.set('Lectura simulada para probar el flujo web; en Android se abre la cámara real.');
        return;
      }

      const { supported } = await BarcodeScanner.isSupported();
      if (!supported) {
        this.mensaje.set('Este dispositivo no tiene una cámara compatible con el escáner.');
        return;
      }

      if (plataforma === 'android') {
        const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
        if (!available) {
          await BarcodeScanner.installGoogleBarcodeScannerModule();
          this.mensaje.set('Se inició la instalación del módulo de escaneo de Google. Cuando termine, pulsa Escanear QR otra vez.');
          return;
        }
      }

      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode],
        autoZoom: true,
      });
      const texto = barcodes[0]?.rawValue?.trim();
      if (texto) {
        this.resultado.set(texto);
        const enlace = this.detectarEnlace(texto);
        this.enlaceQr.set(enlace);
        if (enlace) {
          this.mensaje.set('Se detectó un enlace. Revísalo y pulsa Abrir enlace para continuar.');
        } else {
          await this.consultar(texto);
        }
      } else {
        this.mensaje.set('No se leyó ningún código QR.');
      }
    } catch (error) {
      this.mensaje.set(error instanceof Error ? error.message : 'No se pudo abrir el escáner QR.');
    } finally {
      this.procesando.set(false);
    }
  }

  private async consultar(codigo: string): Promise<void> {
    try {
      const respuesta = await this.api.consultarQr(codigo);
      this.consultaDatos.set(respuesta);
      this.consulta.set(JSON.stringify(respuesta, null, 2));
    } catch (error) {
      this.consulta.set(error instanceof Error ? error.message : 'La consulta GET no se pudo completar.');
    }
  }

  async abrirEnlace(): Promise<void> {
    const url = this.enlaceQr();
    if (!url) {
      return;
    }
    try {
      await Browser.open({ url });
    } catch {
      this.mensaje.set('No se pudo abrir el enlace en el navegador.');
    }
  }

  private detectarEnlace(texto: string): string | null {
    try {
      const url = new URL(texto);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  async agregarMovimiento(): Promise<void> {
    const datos = this.consultaDatos()?.datos;
    if (!datos) {
      return;
    }
    await this.movimientos.registrar(datos);
    this.mensaje.set('Movimiento del QR agregado a Inicio.');
  }
}