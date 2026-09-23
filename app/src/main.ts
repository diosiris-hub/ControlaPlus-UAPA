/**
 * main.ts — arranque de Controla+.
 * ---------------------------------------------------------------------------
 *  - provideHttpClient(): ApiService envía los movimientos al servidor (modo_offline).
 *  - IonicStorageModule.forRoot(): base de datos local de OfflineStorageService.
 *
 * Compartir Cerca no necesita providers: PERIFERICO_BLE se resuelve solo.
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { IonicStorageModule } from '@ionic/storage-angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideHttpClient(),
    importProvidersFrom(IonicStorageModule.forRoot({ name: 'controlaplus_db' })),
  ],
});
