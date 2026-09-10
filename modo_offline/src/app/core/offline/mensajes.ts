/**
 * Catálogo de mensajes del módulo de conectividad.
 * ---------------------------------------------------------------------------
 * Textos exactos acordados en el documento de diseño (sección 4). Se
 * centralizan para que la app, las pruebas y la documentación usen siempre la
 * misma redacción: cercana y sin tecnicismos.
 */
export const MENSAJES = {
  toastGuardadoOffline:
    'Movimiento guardado en tu teléfono. Se enviará automáticamente al reconectar.',
  toastEnviadoOnline: 'Movimiento enviado al servidor.',
  etiquetaPendiente: '⏳ Pendiente de sincronizar',
  toastSyncOk: (n: number): string =>
    `Sincronización completada: ${n} movimiento${n === 1 ? '' : 's'} enviado${n === 1 ? '' : 's'} al servidor.`,
  toastSyncError:
    'Volvió la conexión, pero algunos movimientos no se enviaron. Lo intentaremos de nuevo en unos momentos.',
} as const;

/** Duración de los toasts (spec: 4 s, posición inferior). */
export const DURACION_TOAST_MS = 4000;

/** Espera antes de reintentar una sincronización fallida. */
export const REINTENTO_SYNC_MS = 6000;
