/**
 * tabs.page.ts — barra de pestañas de Controla+ con la pestaña "Traspaso".
 * ---------------------------------------------------------------------------
 * Si el proyecto ya tiene su propio TabsPage, no hace falta copiar este
 * archivo: basta con añadir el <ion-tab-button tab="traspaso"> al existente y
 * la ruta hija correspondiente en app.routes.ts.
 */
import { Component } from '@angular/core';
import {
  IonIcon,
  IonLabel,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { homeOutline, swapHorizontalOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonRouterOutlet],
  templateUrl: './tabs.page.html',
})
export class TabsPage {
  constructor() {
    addIcons({ homeOutline, swapHorizontalOutline });
  }
}
