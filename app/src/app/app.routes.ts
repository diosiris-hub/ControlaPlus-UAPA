/**
 * app.routes.ts — rutas de Controla+.
 * ---------------------------------------------------------------------------
 * Las pantallas cuelgan de TabsPage (barra de pestañas):
 *   /tabs/inicio     → Home de modo_offline (balance y movimientos)
 *   /tabs/compartir  → Compartir Cerca (BLE)
 * Se deja además el alias /compartir para abrirla directamente.
 */
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tabs',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      {
        path: 'inicio',
        loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'compartir',
        loadComponent: () => import('./compartir/compartir.page').then((m) => m.CompartirPage),
      },
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
    ],
  },

  {
    path: 'compartir',
    loadComponent: () => import('./compartir/compartir.page').then((m) => m.CompartirPage),
  },

  { path: '', redirectTo: 'tabs/inicio', pathMatch: 'full' },
  { path: '**', redirectTo: 'tabs/inicio' },
];
