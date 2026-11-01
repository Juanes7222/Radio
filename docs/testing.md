# Sistema de pruebas

El repositorio tiene tres workspaces con Vitest y una herramienta de revisión
que un agente puede correr sobre su propio diff. Este documento es el inventario
y el contrato: qué se ejecuta, qué garantiza cada capa y qué queda fuera a
propósito.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm test` | Turbo ejecuta el `test` de `@radio/web`, `@radio/mobile` y `@radio/backend`. |
| `pnpm typecheck` | Turbo ejecuta el `typecheck` de cada workspace que lo declara. |
| `pnpm test:design` | Solo los guardarraíles de diseño de web y mobile. |
| `pnpm design:review` | Revisa el diff actual contra las reglas de diseño y muestra el checklist manual. |
| `pnpm verify` | Typecheck, tests y revisión de diseño, en ese orden. |
| `pnpm --filter @radio/web run test tests/design` | Un directorio concreto de un workspace. |
| `pnpm --filter @radio/web run test tests/design/tokens.test.ts` | Un archivo concreto. |

`pnpm test` pasa por Turbo. Solo `@radio/web` declara que su tarea `test`
depende de `build`, porque `tests/perf/` y `tests/catalog/buildOutput.test.ts`
leen `dist/`; `apps/web/turbo.json` es donde vive esa dependencia. Mobile y
backend prueban directo contra el código fuente, sin construir ni generar el
cliente Prisma. Ejecutar Vitest directo en web sin build previo hace que las
pruebas de `dist/` fallen o se salten.

## Capas e inventario

| Workspace | Directorio | Qué cubre |
| --- | --- | --- |
| `apps/web` | `tests/design/` | Tokens y tema del panel, accesibilidad, movimiento, objetivos táctiles, reglas de la herramienta de revisión. |
| | `tests/perf/` | Presupuesto de bundle, fronteras de importación, activos estáticos y SEO por ruta. |
| | `tests/routing/` | URLs de medios y mapa de rutas de nginx. |
| | `tests/settings/`, `tests/youtube/`, `tests/bumpers/` | Cableado de paneles: que el control correcto lea la fila correcta y que no queden lecturas de configuración retirada. |
| | `tests/catalog/` | Catálogo público, metadatos SEO, service worker y salida del build. |
| | `tests/artwork/` | Que el interruptor de portadas llegue a todas las superficies. |
| `apps/mobile` | `tests/design/` | Paleta y contraste AA, tipografía, movimiento y motion reducido, haptics, objetivos de 48dp, estados de carga, copy en tuteo. |
| | `tests/sse/` | Polyfill de SSE del now-playing. |
| `backend` | `tests/settings/` | Caché, validación, servicio, rutas vistas y orden de arranque. |
| | `tests/bible/`, `tests/catalog/` | Semilla y servicio del catálogo. |
| | `tests/infrastructure/` | Que la suite pura nunca cargue el cliente Prisma. |
| | `tests/shared/` | Utilidades puras: paginación, escape HTML, título desde nombre de archivo, slug. |
| | `tests/scripts/` | Cableado de los scripts de despliegue. |

Hay tres estilos de prueba y conviene elegir a conciencia:

1. **Runtime**: se importa el módulo y se ejecuta la función. Es el preferido
   cuando la lógica es pura. Ejemplo: `apps/web/tests/settings/form-values.test.ts`,
   `backend/tests/shared/utils.test.ts`.
2. **Fuente**: se lee el `.tsx`/`.css` y se afirma una invariante que el
   compilador no puede expresar (una clase, un ref indexado, un `alt`). Es el
   estilo de `tests/design/` y `tests/perf/`.
3. **Build**: se construye con Vite o se lee `dist/`. Solo cuando lo que se
   quiere probar es la salida de la compilación.

Una prueba de fuente no debe reemplazar a una de runtime si la función se puede
llamar. Y no debe afirmar texto literal de una frase de copy: para eso está el
checklist manual.

## Guardarraíles de diseño

Estos tests fallan cuando el cambio rompe una decisión que ya está documentada
en `docs/frontend-context.md`. No son preferencias: cada uno protege un fallo
concreto que ya ocurrió o que costaría caro descubrir en producción.

En `apps/web/tests/design/`:

- `tokens.test.ts`: `:root` declara todos los tokens públicos, `.admin-theme`
  los redeclara todos (un token sin override hereda la paleta pública, que es
  como aparece un anillo indigo dentro del panel ámbar), el tema del panel no
  comparte primario ni radio con el público, los tokens con modificador de
  opacidad son tripletes HSL y todo `hsl(var(--x))` de `tailwind.config.js`
  conserva `<alpha-value>`.
- `accessibility.test.ts`: `lang="es"`, zoom táctil disponible, toda `<img>` con
  `alt` y foco visible en las clases interactivas que viven en `index.css`.
- `motion.test.ts`: el bloque global de `prefers-reduced-motion`, la transición
  de ruta solo de entrada (sin `exit`, sin `AnimatePresence`) y el carrusel de
  avisos que se detiene con movimiento reducido.
- `touch-targets.test.ts`: piso de 44px del sitio público y el reset del panel,
  que es lo que permite tablas densas sin estirar cada botón.
- `design-review.test.ts`: prueba la herramienta de revisión (reglas y parser
  del diff) para que un agente no confíe en una herramienta rota.

En `apps/mobile/tests/design/` la paleta, el contraste AA, los 48dp, el tuteo y
la reducción de movimiento ya vienen cubiertos por 30 archivos. Un cambio de UI
móvil que agregue un token o un control nuevo debe extender esa carpeta, no
crear otra convención.

## Revisión de diseño para agentes

`pnpm design:review` compara el árbol de trabajo con una referencia (`HEAD` por
defecto) y revisa **solo las líneas agregadas**. La deuda que el archivo ya
tenía no se convierte en un fallo del cambio.

```bash
pnpm design:review                          # diff sin commitear contra HEAD
pnpm design:review --base origin/main       # rama contra la base
pnpm design:review --json                   # informe para otra herramienta
pnpm design:review --strict                 # los avisos también fallan
```

El código de salida es `0` sin errores, `1` con errores (o avisos bajo
`--strict`) y `2` si el uso o git fallan. Los archivos nuevos sin seguimiento se
leen completos como líneas agregadas.

Reglas automáticas (solo líneas nuevas):

| Regla | Severidad | Qué detecta |
| --- | --- | --- |
| `design/raw-color` | error | `#hex`, `rgb()`, `rgba()`, `hsl()` con números fuera de los archivos de tokens. |
| `design/emoji` | error | Emoji en código de UI, fuera de comentarios. |
| `design/img-alt` | error | `<img>` agregada sin `alt`. |
| `design/slate-utilities` | aviso | Utilidades `slate-*` en `pages/admin/` o `components/admin/`. |
| `design/transition-all` | aviso | `transition-all`, que anima propiedades que no cambian. |

El informe termina con el checklist manual. Es la parte que ningún test puede
juzgar y la que el agente debe responder en su resumen: jerarquía, estados,
responsive, copy, movimiento, accesibilidad, tokens, consistencia y riesgo. Si
el cambio no toca UI, el checklist se responde igual pero en una línea.

Flujo recomendado para un agente:

1. Lee `docs/frontend-context.md` antes de tocar una superficie.
2. Implementa el cambio.
3. Corre `pnpm design:review --strict` y corrige lo que sea del cambio.
4. Corre los tests del workspace afectado.
5. Responde el checklist en la entrega, nombrando lo que no pudo verificar.

## Lo que no cubre

- **Navegador real**: no hay Playwright ni pruebas de interacción. Los tests de
  fuente prueban que el cableado existe, no que el flujo funcione con un clic.
  Una revisión visual sigue siendo necesaria en cambios de layout.
- **Regresión visual**: no hay capturas ni comparación de píxeles.
- **Base de datos**: no se levanta SQLite en los tests. `prismaFreeSuite.test.ts`
  garantiza que la suite pura no arrastre Prisma; todo lo que depende de una
  consulta se cubre con pruebas de fuente o queda fuera.
- **Runtime de React Native**: `apps/mobile/tests/` corre en Node. No monta
  componentes ni mide un dispositivo.
- **Servicios externos**: AzuraCast, ElevenLabs, Firebase y R2 se mockean o se
  evitan.
- **Copy en pantalla**: el checklist cubre tuteo y tono; no hay snapshots de
  textos.

## Cómo agregar pruebas

- Nombra el archivo por la garantía, no por el componente: `touch-targets`,
  `boot-order`, `form-values`.
- Prefiere runtime; usa fuente cuando la invariante es estructural.
- Escribe el mensaje de la aserción como la explicación del fallo: quien lo vea
  a las 3 a.m. debe entender qué se rompió sin abrir el test.
- No aflojes un guardarraíl para que un cambio pase. Si la regla ya no aplica,
  el cambio incluye la regla y su razón.
- Un cambio de UI debe agregar o extender un test en `tests/design/` del
  workspace correspondiente. Un cambio de backend, un test de comportamiento en
  el módulo.
