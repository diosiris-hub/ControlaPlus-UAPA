export const environment = {
  production: true,
  /** URL base del backend de Controla+ */
  apiUrl: 'https://api.controlaplus.example/v1',
  /**
   * true  → ApiService responde localmente (sin servidor) tras ~900 ms.
   * false → se hace un POST real a `${apiUrl}/movimientos/lote`.
   * Sigue en true mientras no exista el backend.
   */
  usarServidorSimulado: true,
  /** Carga tres movimientos de ejemplo la primera vez que se abre la app. */
  cargarDatosDemo: true,
};
