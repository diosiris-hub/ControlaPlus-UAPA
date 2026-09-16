/**
 * app.routes.ts — rutas de Controla+ con el módulo Traspaso Cerca registrado.
 * ---------------------------------------------------------------------------
 * Las pantallas cuelgan de TabsPage, que dibuja la barra de pestañas. La ruta
 * del módulo nuevo es /tabs/traspaso, y se deja además el alias /traspaso para
 * poder abrirla directamente (deep link o botón desde otra pantalla).
 *
 * Todas las páginas se cargan con loadComponent (standalone, sin NgModules).
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
        path: 'traspaso',
        loadComponent: () => import('./traspaso/traspaso.page').then((m) => m.TraspasoPage),
      },
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
    ],
  },

  // Alias directo a la pantalla de traspaso (sin pasar por el tab bar).
  {
    path: 'traspaso',
    loadComponent: () => import('./traspaso/traspaso.page').then((m) => m.TraspasoPage),
  },

  { path: '', redirectTo: 'tabs/inicio', pathMatch: 'full' },
  { path: '**', redirectTo: 'tabs/inicio' },
];
