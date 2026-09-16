/**
 * main.ts — proveedores necesarios para el módulo Traspaso Cerca.
 * ---------------------------------------------------------------------------
 * El punto importante es WebServer: las clases de @awesome-cordova-plugins son
 * @Injectable() SIN providedIn, así que hay que declararlas explícitamente en
 * los providers. Sin esta línea, TransferServerService falla al inyectarse con
 * "NullInjectorError: No provider for WebServer".
 *
 * Si el proyecto ya tiene su main.ts, basta con añadir WebServer a su array de
 * providers; el resto de líneas son las habituales de un proyecto Ionic.
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { WebServer } from '@awesome-cordova-plugins/web-server/ngx';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),

    // Rol RECEPTOR: mini servidor HTTP en el puerto 8988.
    WebServer,
  ],
});
