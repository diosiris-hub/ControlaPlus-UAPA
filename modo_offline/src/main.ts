/**
 * main.ts — proveedores necesarios para el módulo de conectividad
 * ---------------------------------------------------------------------------
 *  - provideHttpClient(): ApiService envía los movimientos al servidor.
 *  - IonicStorageModule.forRoot(): base de datos local de OfflineStorageService.
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { IonicStorageModule } from '@ionic/storage-angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(),
    importProvidersFrom(IonicStorageModule.forRoot({ name: 'controlaplus_db' })),
  ],
});
