/**
 * OfflineStorageService — Entregable 2 · Persistencia local
 * ---------------------------------------------------------------------------
 * Guarda los movimientos en el dispositivo con @ionic/storage-angular.
 * Ionic Storage elige el mejor motor disponible (SQLite en nativo si está el
 * driver, IndexedDB en el WebView/navegador y localStorage como último
 * recurso), por lo que los datos sobreviven al cierre de la app.
 *
 * Patrón offline-first: la app SIEMPRE escribe aquí primero. La cola de
 * sincronización no es una estructura aparte: son los movimientos cuyo
 * `estado` es 'pendiente'.
 */
import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Movimiento } from './movimiento.model';

/** Clave única bajo la que se guarda la lista completa. */
const CLAVE_MOVIMIENTOS = 'controlaplus.movimientos';

@Injectable({ providedIn: 'root' })
export class OfflineStorageService {
  private storage: Storage | null = null;

  /** Copia en memoria para lecturas síncronas y para alimentar la vista. */
  private readonly movimientosSubject = new BehaviorSubject<Movimiento[]>([]);

  /** La vista se suscribe aquí; emite cada vez que cambia la lista. */
  readonly movimientos$: Observable<Movimiento[]> = this.movimientosSubject.asObservable();

  /** Promesa que se resuelve cuando el motor de almacenamiento está listo. */
  private readonly listo: Promise<void>;

  constructor(private readonly ionicStorage: Storage) {
    this.listo = this.inicializar();
  }

  private async inicializar(): Promise<void> {
    // create() abre (o crea) la base de datos; es obligatorio antes de usarla.
    this.storage = await this.ionicStorage.create();
    const guardados = (await this.storage.get(CLAVE_MOVIMIENTOS)) as Movimiento[] | null;

    if (guardados && guardados.length) {
      this.movimientosSubject.next(guardados);
    } else if (environment.cargarDatosDemo) {
      await this.persistir(this.datosDemo());
    }
  }

  /** Todos los movimientos, del más reciente al más antiguo. */
  async todos(): Promise<Movimiento[]> {
    await this.listo;
    return [...this.movimientosSubject.value];
  }

  /** Cola de sincronización: los que aún no llegaron al servidor. */
  async pendientes(): Promise<Movimiento[]> {
    return (await this.todos()).filter((m) => m.estado === 'pendiente');
  }

  /** Inserta al principio de la lista y persiste. */
  async agregar(mov: Movimiento): Promise<void> {
    await this.listo;
    await this.persistir([mov, ...this.movimientosSubject.value]);
  }

  /** Marca como sincronizados los ids indicados (tras un envío exitoso). */
  async marcarSincronizados(ids: string[]): Promise<void> {
    await this.listo;
    const conjunto = new Set(ids);
    const actualizados = this.movimientosSubject.value.map((m) =>
      conjunto.has(m.id) ? { ...m, estado: 'sincronizado' as const } : m,
    );
    await this.persistir(actualizados);
  }

  /** Borra todo (útil en pruebas). */
  async limpiar(): Promise<void> {
    await this.listo;
    await this.persistir([]);
  }

  private async persistir(lista: Movimiento[]): Promise<void> {
    await this.storage!.set(CLAVE_MOVIMIENTOS, lista);
    this.movimientosSubject.next(lista);
  }

  /** Movimientos de ejemplo para la demostración (misma data del prototipo). */
  private datosDemo(): Movimiento[] {
    const hoy = new Date();
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    const a = (d: Date, h: number, m: number): string => {
      const x = new Date(d);
      x.setHours(h, m, 0, 0);
      return x.toISOString();
    };
    return [
      { id: 'demo-1', concepto: 'Supermercado La Sirena', monto: 1250, tipo: 'gasto', fecha: a(hoy, 10, 20), estado: 'sincronizado' },
      { id: 'demo-2', concepto: 'Pago recibido — Cliente', monto: 5000, tipo: 'ingreso', fecha: a(hoy, 8, 5), estado: 'sincronizado' },
      { id: 'demo-3', concepto: 'Farmacia Carol', monto: 480, tipo: 'gasto', fecha: a(ayer, 18, 40), estado: 'sincronizado' },
    ];
  }
}
