# Visibilidad en Google — runbook

Todo lo que hay que hacer a mano en Google para que el contenido de la
emisora (la Biblia, el catálogo de alabanza, los videos) aparezca en las
búsquedas, y cómo medir si está sirviendo de algo.

Este documento es para la persona que opera el sitio. No hace falta leer el
código ni el plan: basta con seguir los pasos en orden, una vez cada uno, y
después repetir la lista de la última sección una vez por semana.

**Qué NO hay que hacer aquí.** Las correcciones técnicas (canonical con
barra final, 404 real para las rutas desconocidas, service worker, sitemap)
ya están hechas en el código y se publican con cada despliegue. Este runbook
solo cubre el trabajo que depende de una persona con una cuenta de Google.

---

## 0. Antes de empezar: comprobar que el sitio está listo

Google indexa lo que está publicado. Si el sitemap no existe o una ruta
desconocida sigue respondiendo 200, se pierde el trabajo de las secciones
siguientes. En el servidor, con `curl`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://lavozverdad.com/sitemap.xml        # 200
curl -s -o /dev/null -w "%{http_code}\n" https://lavozverdad.com/no-existe-esta-ruta # 404
curl -s -o /dev/null -w "%{http_code}\n" https://lavozverdad.com/programacion/        # 200
curl -s -o /dev/null -w "%{http_code}\n" https://lavozverdad.com/admin/login         # 200
curl -s -o /dev/null -w "%{http_code}\n" https://lavozverdad.com/robots.txt           # 200
```

Si alguno no da lo esperado, se arregla antes de seguir: no se arregla
desde Google.

Además, el canonical de una página generada tiene que apuntar a sí misma:

```bash
curl -s https://lavozverdad.com/biblia/job/1/ | grep -i canonical
# <link rel="canonical" href="https://lavozverdad.com/biblia/job/1/" />
```

La barra final importa: es la forma que el servidor responde con 200, y
Google toma el canonical tal cual, con barra.

---

## 1. Verificar la propiedad `lavozverdad.com` y enviar el sitemap

### 1.1 Verificar la propiedad con el registro TXT de DNS

1. Entrar a [search.google.com/search-console](https://search.google.com/search-console)
   con la cuenta de Google de la estación.
2. **Añadir propiedad** → tipo **Dominio** (no "prefijo de URL"). Escribir
   `lavozverdad.com` y continuar.
   - La propiedad de tipo Dominio cubre el dominio con y sin `www`, con
     `http` y con `https`, y todos los subdominios. No hace falta crear una
     segunda propiedad para `www` ni para el panel.
3. En el método de verificación elegir **Configuración de DNS**. Google
   muestra un valor tipo
   `google-site-verification=abc123...`. Copiarlo con el botón de copiar.
4. En el panel del proveedor de DNS donde está registrado el dominio
   (el registrador, no el servidor), crear un registro:

   | Campo    | Valor                        |
   |----------|------------------------------|
   | Tipo     | `TXT`                        |
   | Nombre   | `@` (o vacío, la raíz)       |
   | Valor    | el código que dio Google     |
   | TTL      | el que tenga por defecto     |

5. Volver a Search Console y pulsar **Verificar**.
   - Si todavía no aparece, la propagación del DNS puede tardar de minutos a
     48 horas. Pulsar **Verificar más tarde** y volver al día siguiente.
   - No borrar el registro TXT después de verificar: si el dominio cambia de
     manos, es la prueba de propiedad.

### 1.2 Enviar el sitemap

1. En Search Console, **Indexación → Sitemaps**.
2. En el campo "Añadir un sitemap" escribir `sitemap.xml` (la propiedad
   `https://lavozverdad.com` ya pone el prefijo) y pulsar **Enviar**.
3. La columna de estado debe quedar en **Correcto**. Si queda en error, el
   enlace del estado explica por qué; lo más común es que Google no pudo
   leer el archivo, y en ese caso se comprueba con el `curl` de la sección 0.
4. El `robots.txt` del sitio ya declara el sitemap
   (`Sitemap: https://lavozverdad.com/sitemap.xml`), así que Google también
   lo encuentra por su cuenta. Enviarlo a mano solo acelera el primer rastreo.

El sitemap lo escribe la compilación del sitio y lo publica el despliegue.
Contiene las nueve rutas públicas y todas las páginas generadas (libros,
capítulos, artistas, videos). No hay que enviar nada más: las páginas
generadas entran por el sitemap, no una por una.

---

## 2. Declarar el nombre del sitio ("La Voz de la Verdad")

**Qué cambia.** En el resultado de búsqueda, Google muestra junto a cada
enlace el nombre del sitio al que pertenece. Ese nombre es lo que hace que
la gente reconozca la emisora y no una página cualquiera: "La Voz de la
Verdad" compite con muchas entidades con nombres parecidos, y sin ese
nombre Google termina mostrando el dominio pelado (`lavozverdad.com`).

**Dónde está declarado.** Hoy no hay ningún formulario que llenar: Google
retiró la herramienta `webmasters.google.com/site-names` (responde 404) y la
declaración se hace con el marcado de la página de inicio.

- `WebSite` en el JSON-LD de la portada, con `name` = "La Voz de la Verdad"
  y `url` = `https://lavozverdad.com/`.
- `og:site_name` en los标签 de Open Graph, con el mismo valor.

Los dos salen de `SITE_NAME` en `apps/web/src/config/seo.config.ts`: si
algún día se cambia el nombre, se cambia una sola vez ahí y se redespliega.
Solo importa en la portada; en las páginas internas Google usa el nombre de
la portada para todo el sitio.

**Qué hacer, paso a paso.**

1. Comprobar que el marcado está publicado:
   ```bash
   curl -s https://lavozverdad.com/ | grep -A3 '"@type": "WebSite"'
   ```
   Debe aparecer `"name": "La Voz de la Verdad"`.
2. Validar la portada en el
   [validador de Schema.org](https://validator.schema.org/#url=https://lavozverdad.com/).
   El "Rich Results Test" no sirve aquí: los nombres de sitio no son un tipo
   de resultado enriquecido.
3. Pedir la reindexación de la portada (sección 3).
4. Comprobar qué muestra Google: en el móvil y en el escritorio, buscar
   `site:lavozverdad.com` y ver si el nombre es "La Voz de la Verdad" o el
   dominio.
5. Si después de un par de semanas Google sigue mostrando el dominio:
   - primero confirmar que los 301 de `www` y de `vozyverdad.com` apuntan a
     `https://lavozverdad.com` (el nombre se toma de la página de destino);
   - si los 301 están bien, el nombre alternativo ya se declara en el nodo
     `WebSite` (`alternateName` en `organizationNodes()`,
     `apps/web/src/config/seo.config.ts`), que es donde Google lo lee. Con
     el despliegue hecho, se vuelve a pedir la reindexación de la portada.

---

## 3. Pedir la reindexación de las nueve rutas públicas

Las nueve rutas con canonical son estas, **con barra final**:

```
https://lavozverdad.com/
https://lavozverdad.com/programacion/
https://lavozverdad.com/opiniones/
https://lavozverdad.com/lectura-de-hoy/
https://lavozverdad.com/info/who-we-are/
https://lavozverdad.com/info/privacy/
https://lavozverdad.com/info/terms/
https://lavozverdad.com/info/data-treatment/
https://lavozverdad.com/info/cookies/
```

Para cada una:

1. En Search Console, abrir **Inspección de URLs** (la barra de arriba).
2. Pegar la URL y pulsar Intro.
3. Leer **"Canonical seleccionado por Google"** y **"Canonical declarado por
   el autor"**: los dos tienen que ser la misma URL, con barra final. Si
   difieren, el problema está en el canonical que se publicó, no en Google.
4. Pulsar **Solicitar indexación**. Es una petición, no una orden: Google la
   acepta o no, y no garantiza la indexación.

**Qué esperar.** La indexación suele tardar unos días, pero la corrección
del canonical (la barra final y la unificación de los cuatro dominios) puede
tardar **hasta dos semanas** en ser reevaluada. Durante ese tiempo una
página puede quedarse en un grupo de duplicados y no salir en las
búsquedas: es normal, no es un error del sitio. Comprobar el estado en
**Indexación → Páginas**.

**Lo que no hay que hacer:**

- No repetir la petición cada día. No acelera nada y consume la cuota
  diaria de peticiones de indexación.
- No pedir una por una las páginas generadas (los capítulos de la Biblia,
  los artistas, los videos): hay cientos y para eso está el sitemap. La
  cuota diaria de peticiones se gasta mejor en las nueve rutas.

---

## 4. Leer el informe de rendimiento

**Performance → Resultados de búsqueda.** Intervalo: últimos 28 días
comparados con los 28 anteriores.

** pestaña "Consultas"** — qué busca la gente:

- Las consultas con impresiones pero sin clics son las que hay que
  arreglar: si alguien busca "radio cristiana cartago" y no hace clic, el
  título o la descripción no convencen. Se corrige en el código (cada ruta
  tiene su título y su descripción en `apps/web/src/config/seo.config.ts`).
- Las consultas que sí traen clics son las que justifican más páginas del
  mismo tipo. Si "biblia reina valera" trae clics, entonces la página de
  cada capítulo vale la pena; si "letra de alabanza" trae clics, entonces
  las páginas de los artistas ya publicadas valen la pena.
- Anotar cada semana las consultas nuevas. Es la lista de trabajo real.

**pestaña "Páginas"** — qué página recibe las impresiones:

- Sirve para ver si las páginas generadas están entrando: las que
  aparecen aquí con impresiones son las que ya están indexadas.
- Filtrar por "Consulta contiene" para saber qué consulta trae cada página.

**La métrica real es la cantidad de oyentes.** Una visita a la portada no
es un oyente: el oyente es el que aprieta "play" y se queda escuchando. El
panel lo dice:

- Panel → **Dashboard** (`/admin/dashboard`, o `panel.lavozverdad.com`).
- "Oyentes ahora", "Oyentes totales" y "Oyentes únicos", más la gráfica de
  **oyentes de las últimas 24 horas**.

Search Console sirve para saber **quién** busca y **qué** busca; el panel
dice si eso se convirtió en gente escuchando. Una semana con muchas
impresiones y oyentes plano es un problema de la portada, no del SEO.

---

## 5. Informe de rendimiento de IA generativa

Desde el 31 de agosto de 2026 Google lo publica para todos los sitios: en
Search Console, **Performance → informe de rendimiento de IA generativa**
(hay también una versión para Discover).

- **Qué muestra**: las impresiones del sitio dentro de las funciones de IA
  generativa de la búsqueda (AI Overviews, AI Mode), agrupadas por páginas,
  países, dispositivos y fechas.
- **Qué NO muestra**: clics, ni CTR, ni posición, ni las consultas. Una
  mención en una respuesta de IA no se puede clicar, así que no hay dato de
  clic: el número que se mira son las impresiones.
- **Requisito para ser elegible**: el sitio tiene que estar **incluido** en
  las funciones de IA generativa de la búsqueda. Se comprueba en
  **Configuración → Search generative AI**: la opción debe ser "Incluir los
  enlaces y el contenido de mi sitio en las funciones de IA generativa de
  la búsqueda" (es la opción por defecto). Si el sitio está excluido, no
  recibe impresiones ni tráfico de esas funciones, y el informe no aparece.
- **Si el informe no aparece**: casi siempre es porque el sitio todavía no
  ha tenido suficientes impresiones en las funciones de IA, o porque está
  excluido (o la propiedad es nueva). No es un error del sitio.

Por qué importa: una respuesta de IA que cita el capítulo de la Biblia de
la estación es una mención de la emisora con público y sin clic. Por eso el
número que se anota es el de impresiones.

---

## 6. Medir el rendimiento con PageSpeed Insights

### 6.1 Conseguir la clave de la API

1. Entrar a [console.cloud.google.com](https://console.cloud.google.com).
2. Crear un proyecto (por ejemplo "La Voz de la Verdad — SEO") o elegir uno
   existente.
3. **APIs y servicios → Biblioteca** → buscar "PageSpeed Insights API" →
   **Habilitar**.
4. **APIs y servicios → Credenciales** → **Crear credenciales → Clave de
   API** → copiar la clave.
5. Recomendado: abrir la clave recién creada → **Restringir clave** →
   restricción de API → **PageSpeed Insights API** → Guardar. Una clave sin
   restricción puede ser usada contra cualquier API de Google que acepte
   claves y facturar al proyecto.
6. Guardar la clave en Infisical (el gestor de secretos del proyecto), no en
   el repositorio. Hoy la aplicación no la usa: es solo para las mediciones
   manuales.

### 6.2 Qué medir

```bash
curl "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://lavozverdad.com/&key=TU_CLAVE"
```

Los umbrales que importan son los de los datos de campo (usuarios reales),
en el **percentil 75**, que es el valor que Google usa para clasificar la
experiencia:

| Métrica | Bueno       | Qué es                                        |
|---------|-------------|-----------------------------------------------|
| LCP     | menos de 2,5 s | cuándo aparece el contenido principal      |
| INP     | menos de 200 ms | cuánto tarda la página en responder       |
| CLS     | menos de 0,1   | cuánto salta el contenido al cargar      |

- Los datos de campo vienen de CrUX (Chrome UX Report) y **solo aparecen si
  esa URL tiene tráfico real suficiente**. Si no aparecen, la respuesta trae
  únicamente la simulación de Lighthouse: sirve para diagnóstico, no para
  decir si la métrica es buena.
- Google está retirando los datos de campo de la API de PageSpeed Insights;
  para ellos, la misma clave con la "Chrome UX Report API" habilitada.
- **Qué mirar primero en esta casa**: el INP. La portada carga framer-motion,
  el reproductor en vivo y varios paquetes de terceros, y es la métrica que
  está en riesgo. El LCP depende de la portada y el CLS, del reproductor.
- Medir antes y después de cada cambio de la portada y anotar la fecha. Un
  número sin fecha no sirve.

---

## 7. Lista semanal (quince minutos)

| # | Qué mirar | Dónde | Qué anotar |
|---|-----------|-------|------------|
| 1 | Consultas | Performance → Consultas (últimos 7 días) | Una consulta nueva que justifique una página, o un clic nuevo |
| 2 | Cobertura del índice | Indexación → Páginas | "No indexado" con motivo nuevo, sobre todo "Página con redirección" o "Duplicada, Google chose another canonical" |
| 3 | Oyentes | Panel → Dashboard: gráfica de 24 h, totales y únicos | Si subió o bajó frente a la semana anterior |
| 4 | IA generativa | Performance → informe de IA generativa | Impresiones de la semana (opcional) |

Reglas de la lista:

- Si el punto 2 muestra un motivo nuevo, se anota el motivo exacto y la URL;
  sin eso no se puede pedir nada.
- No se pide indexación a diario (sección 3).
- Si se toca el canonical o el título de una ruta, se vuelve a pedir la
  indexación de esa ruta y se espera hasta dos semanas antes de mirar el
  resultado.

---

## Dónde vive cada cosa

| Qué | Dónde |
|-----|-------|
| Sitemap (se genera en la compilación) | `apps/web/src/config/seo.config.ts` (`buildSitemapXml`), escrito por `apps/web/vite/seoPlugin.ts` |
| Canonical, título y descripción de cada ruta | `apps/web/src/config/seo.config.ts` (`PUBLIC_ROUTES`, `ROUTE_META`) |
| Nombre del sitio | `apps/web/src/config/seo.config.ts` (`SITE_NAME`), en el JSON-LD `WebSite` y en `og:site_name` |
| `robots.txt` | `apps/web/public/robots.txt` |
| 404 de las rutas desconocidas | `scripts/nginx/radio-global.conf` (mapa `$spa_route`) y `scripts/nginx/snippets/web-locations.conf` |
| Service worker (no guarda en la caché las páginas de catálogo) | `apps/web/public/sw.js` |

Plan y diseño completos: `docs/superpowers/specs/2026-10-21-visibilidad-google-design.md`
y `docs/superpowers/plans/2026-10-21-visibilidad-google.md`.
