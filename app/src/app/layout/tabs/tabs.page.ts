/**
 * tabs.page.ts — barra de pestañas de Controla+: Inicio y Compartir.
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
import { bluetoothOutline, homeOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonRouterOutlet],
  templateUrl: './tabs.page.html',
})
export class TabsPage {
  constructor() {
    addIcons({ homeOutline, bluetoothOutline });
  }
}
