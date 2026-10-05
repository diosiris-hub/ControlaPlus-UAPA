/**
 * ApiService — cliente HTTP hacia el servidor de Controla+
 * ---------------------------------------------------------------------------
 * Único punto por el que salen datos al backend. Con
 * `environment.usarServidorSimulado = true` responde localmente tras ~900 ms,
 * lo que permite probar el módulo sin un servidor real y forzar fallos desde
 * la interfaz para verificar el reintento automático.
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Movimiento } from './movimiento.model';

export interface ConsultaQr {
  codigo: string;
  encontrado: boolean;
  datos?: { concepto: string; monto: number; tipo: 'gasto' | 'ingreso' };
  origen: 'simulado' | 'servidor';
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /** Solo para demostración: hace fallar el envío simulado. */
  simularFallo = false;

  async consultarQr(codigo: string): Promise<ConsultaQr> {
    if (environment.usarServidorSimulado) {
      await firstValueFrom(timer(500));
      let datos: ConsultaQr['datos'];
      try {
        const payload = JSON.parse(codigo) as Partial<NonNullable<ConsultaQr['datos']>>;
        if (typeof payload.concepto === 'string' && typeof payload.monto === 'number') {
          datos = {
            concepto: payload.concepto,
            monto: payload.monto,
            tipo: payload.tipo === 'ingreso' ? 'ingreso' : 'gasto',
          };
        }
      } catch {
        datos = undefined;
      }
      return { codigo, encontrado: true, datos, origen: 'simulado' };
    }

    const respuesta = await firstValueFrom(
      this.http.get<Omit<ConsultaQr, 'origen'>>(`${environment.apiUrl}/qr/consultar`, { params: { codigo } }),
    );
    return { ...respuesta, origen: 'servidor' };
  }

  /**
   * Envía uno o varios movimientos. El servidor debe tratar el `id` como clave
   * idempotente: si el mismo movimiento llega dos veces (por ejemplo, tras un
   * reintento), no se duplica.
   */
  async enviarMovimientos(movimientos: Movimiento[]): Promise<void> {
    if (environment.usarServidorSimulado) {
      await firstValueFrom(timer(900));
      if (this.simularFallo) {
        throw new Error('HTTP 503 Service Unavailable (simulado)');
      }
      return;
    }

    await firstValueFrom(this.http.post(`${environment.apiUrl}/movimientos/lote`, movimientos));
  }
}
