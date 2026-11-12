<!-- [LAYER: UI] -->
# HEAV3NS-JOY: Marco de Soberanía Arquitectónica y Control de Entropía Estructural

[English](../../README.md) · [Otros idiomas](README.md) · [Guía de inicio](../GETTING_STARTED.md) · [Protocolo de agentes](../../AGENTS.md)

> *“No construyas otro lugar donde los agentes se ejecuten. Construye algo de lo que los agentes puedan aprender, llevarse y reproducir independientemente en cualquier lugar.”*

**En una frase:** HEAV3NS-JOY mantiene los repositorios arquitectónicamente honestos (tanto el código humano como el generado por IA) usando una convención mínima y un verificador con cero dependencias.

---

## La idea en 60 segundos

| Dimensión | Detalle |
| :--- | :--- |
| **Qué es** | Una convención más un verificador sin dependencias. Cada archivo declara una de cinco zonas canónicas (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) en su encabezado superior. |
| **Por qué** | La arquitectura se degrada en silencio, y los agentes de IA aceleran esa degradación. Hacer la estructura verificable por máquinas detiene el deterioro en el commit, no en una costosa reescritura. |
| **Cómo** | Coloca cada archivo en la carpeta de su zona, importa solo en las direcciones permitidas y ejecuta `node bin/joy-check.mjs .`. Salida `0` significa integridad total. |
| **Costo** | **Cero dependencias externas**, sin cuentas, sin red, de solo lectura por defecto. |

### La analogía del restaurante

Imagina la base de código como un restaurante:
- **La cocina (`DOMAIN`)**: Elabora recetas puras y reglas de negocio; tiene prohibido llamar a los proveedores a mitad de la cocción.
- **La orquestación (`CORE`)**: Coordina las órdenes y el flujo de los casos de uso.
- **Los proveedores (`INFRASTRUCTURE`)**: Adaptadores para sistema de archivos, HTTP y base de datos.
- **El salón comedor (`UI`)**: Atiende a los comensales y dibuja las pantallas; jamás entra a la despensa de insumos.
- **Las tuberías (`PLUMBING`)**: Utilidades puras sin estado, completamente aisladas.

---

## Las cinco zonas canónicas

| Zona | Carpeta | Responsabilidad | Regla inquebrantable |
| :--- | :--- | :--- | :--- |
| `DOMAIN` | `src/domain/` | Reglas de negocio, entidades, contratos `I*` | **0% de entropía I/O**; prohíbe importar infraestructura o UI |
| `CORE` | `src/core/` | Casos de uso, orquestación, máquinas de estado | Prohíbe importar UI; interactúa con infraestructura mediante contratos |
| `INFRASTRUCTURE` | `src/infrastructure/` | Adaptadores fs, red, base de datos | Prohíbe importar UI; implementa interfaces de Domain |
| `PLUMBING` | `src/plumbing/` | Criptografía, utilidades sin estado | Capa hoja; no importa ninguna otra zona |
| `UI` | `src/ui/` | Presentadores CLI, rutas HTTP, vistas | Prohíbe importar infraestructura directamente |

---

## Inicio rápido (2 minutos)

No se requiere `npm install` (solo Node.js 18+ y git):

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY

# 1. Ejecutar pruebas (196 pruebas pasan)
npm test

# 2. Auditar la arquitectura
npm run joy-check

# 3. Configurar agentes de IA (Claude, Cursor, Antigravity, etc.)
npx heav3ns-joy init
```

Consulta el [Portal de Documentación](../README.md) y el [Modelo Canónico](../../spec/00-CANONICAL-MODEL.md).

