# Equipo Controla+

Controla+ es una sola aplicación (carpeta `app/`) desarrollada por 5 integrantes.
Cada integrante tiene un módulo propio y trabaja en su propia rama. Los cambios
se unen a `main` mediante Pull Request, revisados por el líder técnico.

## Integrantes, ramas y responsabilidades

| Integrante | Rama | Responsabilidad |
|---|---|---|
| José Daniel Marte | feature/jose-integracion | Conectividad + Modo Offline + Integración técnica |
| Francisco José Díaz Abreu | feature/francisco-interfaz | Interfaz + Multimedia |
| Felix Alejandro Mejia Villa | feature/felix-gps | GPS + Mapa |
| Ángel Diosiris Moscoso Viloria | feature/angel-camera-api | Cámara/QR + API REST + Pruebas |
| Kilsy Maria Vasquez Rosario | feature/kilsy-crud | CRUD + Almacenamiento + Requisitos |

Cada integrante tiene un archivo con sus tareas en esta carpeta:

- [JOSE_DANIEL.md](JOSE_DANIEL.md)
- [FRANCISCO.md](FRANCISCO.md)
- [FELIX.md](FELIX.md)
- [ANGEL.md](ANGEL.md)
- [KILSY.md](KILSY.md)

## Reglas del equipo

1. Cada integrante trabaja en su propia rama.
2. No trabajar directamente sobre `main`.
3. Cada integrante debe trabajar principalmente en su módulo.
4. No modificar innecesariamente el trabajo de otro integrante.
5. Probar los cambios antes de crear un Pull Request.
6. Los cambios se integran mediante Pull Request.
7. Si un cambio afecta código compartido, coordinarlo con el líder técnico.
8. Mantener la aplicación funcionando después de los cambios.

## Código compartido

Estos archivos afectan a toda la aplicación. Cualquier cambio en ellos debe
coordinarse con el líder técnico (José Daniel Marte):

- `app/src/app/app.component.ts`
- `app/src/app/app.routes.ts`
- `app/src/main.ts`
- `app/package.json`
