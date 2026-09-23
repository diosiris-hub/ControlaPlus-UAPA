/**
 * ble-receptor.service.ts  (ROL RECEPTOR · periférico BLE)
 * ---------------------------------------------------------------------------
 * Se anuncia como teléfono Controla+, junta los paquetes que escribe el
 * emisor, valida el movimiento y lo deja en `entrante$` para que el usuario
 * lo acepte o lo rechace. La decisión vuelve al emisor por CARACT_RESPUESTA.
 *
 * Anunciarse y recibir escrituras lo hace PERIFERICO_BLE (ver
 * ble-periferico.ts): @capacitor-community/bluetooth-le no cubre ese rol.
 * Todo lo demás está aquí y no depende de qué implementación se elija.
 *
 * Al aceptar se reutiliza modo_offline: el movimiento se guarda con
 * OfflineStorageService.agregar(), con un id nuevo de generarId() y en
 * estado 'pendiente', así que SyncService lo sube al servidor igual que uno
 * registrado a mano.
 */
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OfflineStorageService } from '../offline/offline-storage.service';
import { Movimiento, generarId } from '../offline/movimiento.model';
import { PERIFERICO_BLE } from './ble-periferico';
import {
  CARACT_MOVIMIENTO_UUID,
  CARACT_RESPUESTA_UUID,
  CP_SERVICIO_UUID,
  MovimientoCompartido,
  Reensamblador,
  RespuestaBle,
  codificarRespuesta,
  decodificarMensaje,
} from './ble-protocolo';
import { nombreDelTelefono } from './ble-emisor.service';

@Injectable({ providedIn: 'root' })
export class BleReceptorService {
  private readonly periferico = inject(PERIFERICO_BLE);
  private readonly storage = inject(OfflineStorageService);

  /** Movimiento recibido que espera la decisión del usuario. */
  readonly entrante$ = new BehaviorSubject<MovimientoCompartido | null>(null);

  /** Errores del receptor para que la página los muestre como toast. */
  readonly error$ = new BehaviorSubject<string | null>(null);

  escuchando = false;

  private readonly reensamblador = new Reensamblador();

  /** Empieza a anunciarse. Idempotente, como iniciarRecepcion() en Traspaso. */
  async iniciarRecepcion(): Promise<void> {
    if (this.escuchando) {
      return;
    }
    this.escuchando = true;
    this.error$.next(null);
    this.reensamblador.reiniciar();

    try {
      await this.periferico.iniciar(
        {
          nombre: await nombreDelTelefono(),
          servicio: CP_SERVICIO_UUID,
          caracteristicaEscritura: CARACT_MOVIMIENTO_UUID,
          caracteristicaRespuesta: CARACT_RESPUESTA_UUID,
        },
        (paquete) => void this.alRecibirPaquete(paquete),
      );
    } catch (e) {
      this.escuchando = false;
      this.error$.next(describir(e, 'No se pudo activar la recepción por Bluetooth.'));
      throw e;
    }
  }

  private async alRecibirPaquete(paquete: Uint8Array): Promise<void> {
    const completo = this.reensamblador.agregar(paquete);
    if (!completo) {
      return;
    }

    const mensaje = decodificarMensaje(completo);
    if (!mensaje) {
      await this.responder('invalido');
      this.error$.next('Llegó un movimiento con datos no válidos y se descartó.');
      return;
    }

    // Solo se revisa un movimiento a la vez.
    if (this.entrante$.getValue()) {
      await this.responder('rechazado');
      return;
    }
    this.entrante$.next(mensaje);
  }

  /**
   * Guarda el movimiento en este teléfono. Si ya existe uno idéntico
   * (mismo concepto, monto, tipo y fecha al milisegundo) se avisa y no se
   * duplica: es el caso de que el emisor repita el envío.
   */
  async aceptar(): Promise<'aceptado' | 'duplicado'> {
    const mensaje = this.entrante$.getValue();
    if (!mensaje) {
      throw new Error('no hay ningún movimiento por revisar');
    }

    const existentes = await this.storage.todos();
    const repetido = existentes.some(
      (m) =>
        m.concepto === mensaje.concepto &&
        m.monto === mensaje.monto &&
        m.tipo === mensaje.tipo &&
        m.fecha === mensaje.fecha,
    );

    if (repetido) {
      await this.responder('duplicado');
      this.entrante$.next(null);
      return 'duplicado';
    }

    const movimiento: Movimiento = {
      id: generarId(),
      concepto: mensaje.concepto,
      monto: mensaje.monto,
      tipo: mensaje.tipo,
      fecha: mensaje.fecha,
      estado: 'pendiente',
    };
    await this.storage.agregar(movimiento);
    await this.responder('aceptado');
    this.entrante$.next(null);
    return 'aceptado';
  }

  async rechazar(): Promise<void> {
    await this.responder('rechazado');
    this.entrante$.next(null);
  }

  /**
   * Avisa al emisor. Si el emisor ya se desconectó no se puede avisar, pero
   * la decisión del usuario sigue valiendo: por eso el fallo no se propaga.
   */
  private async responder(r: RespuestaBle): Promise<void> {
    try {
      await this.periferico.notificar(codificarRespuesta(r));
    } catch (e) {
      this.error$.next(describir(e, 'No se pudo avisar al otro teléfono.'));
    }
  }

  /** Deja de anunciarse (al salir de la pantalla o volver al menú). */
  async detener(): Promise<void> {
    if (!this.escuchando) {
      return;
    }
    this.escuchando = false;
    this.reensamblador.reiniciar();
    try {
      await this.periferico.detener();
    } catch (e) {
      this.error$.next(describir(e, 'No se pudo detener la recepción.'));
    }
  }

  limpiar(): void {
    this.entrante$.next(null);
    this.error$.next(null);
  }
}

function describir(e: unknown, porDefecto: string): string {
  const detalle = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (!detalle || detalle === porDefecto) {
    return porDefecto;
  }
  return `${porDefecto} (${detalle})`;
}
