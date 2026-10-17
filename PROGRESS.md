# Progreso - SQL Alumnos
- [x] Fase 1: Backend base (Javalin, conexiÃ³n MariaDB, detecciÃ³n de MySQL activo)
- [x] Fase 2: EjecuciÃ³n SQL (varias sentencias, resultados, errores)
- [x] Fase 3: Frontend (editor con resaltado, grilla de resultados, explorador de bases)
- [x] Fase 4: Consignas con checkbox y persistencia en `data/`
- [x] Fase 5: Historial, favoritos y pestaÃ±as de consulta
- [x] Fase 6: Empaquetado (`build.bat`, `.exe`, `LEEME.txt`)

## Correcciones

### 1. Ocultar la consola al ejecutar
- [x] Causa raÃ­z: `build.bat` nunca usaba `jpackage`; generaba un `SQLAlumnos.bat` que lanzaba `runtime\bin\java.exe`, que es una aplicaciÃ³n de consola.
- [x] `build.bat` genera el launcher con `jpackage --type app-image` **sin** `--win-console` (subsistema PE = GUI, sin ventana).
- [x] Sin consola, la salida va a `logs\app.log` junto al `.exe`, con rotaciÃ³n simple al superar 2 MB (`Main.configurarLogs`, tambiÃ©n SLF4J).
- [x] Si el servidor no arranca (sin puerto libre o error al iniciar), se muestra un diÃ¡logo claro con el motivo y la ruta del log (`Main.mostrarErrorFatal`).

### 2. Entregable: `.exe` real, sin fallback a `.bat`
- [x] Causa raÃ­z: el flujo de build terminaba siempre en `.bat` + `jar`, incluso con dos "ADVERTENCIA" de fallback silencioso.
- [x] `build.bat` ahora exige un JDK 17+ con `jpackage` (lo busca por `JAVA_HOME`, `PATH` o desde la ruta de `java`) y, si no estÃ¡, termina con error explicando quÃ© falta.
- [x] Genera `dist\SQLAlumnos\SQLAlumnos.exe` con el runtime incluido (`runtime\`), `app\` con el jar, `config.properties`, `data\`, `logs\` y `LEEME.txt`.
- [x] VerificaciÃ³n final en el build: existen el `.exe`, `runtime\bin\server\jvm.dll` y `LEEME.txt`.
- [x] `config.properties` y `data/` se resuelven desde la carpeta del `.exe` y no desde el directorio de trabajo (`RutasApp`), asÃ­ que funciona con espacios en la ruta y en otra unidad.
- [x] Ãcono propio (`build\sqlalumnos.ico`, se genera con `node build\generar-icono.cjs`).

### 3. Layout: la pÃ¡gina se cortaba y no habÃ­a scroll
- [x] Causa raÃ­z: faltaba `min-height: 0` en la cadena de contenedores flex; `.sidebar-section` no era `display:flex`, asÃ­ que `.sidebar-content { overflow-y:auto }` nunca tenÃ­a altura calculada y el contenido se salÃ­a de la ventana (`.sidebar` con `overflow:hidden` lo recortaba).
- [x] RaÃ­z a `100vh/100dvh` con `overflow:hidden`; cada panel con su propio `overflow-y:auto` y `min-height:0`.
- [x] Panel izquierdo con EXPLORADOR y CONSIGNAS plegables y con divisor redimensionable; altura mÃ­nima garantizada para consignas (`MIN_CONSIGNAS_ALTO`).
- [x] Historial/favoritos pasÃ³ al Ã¡rea derecha como panel plegable con scroll propio, con divisor para editor/resultados y para el ancho del sidebar.
- [x] TamaÃ±os y paneles plegados se guardan en `data\pestanas.json` y se restauran al abrir.
- [x] Verificado a 1366x768, 1024x600 y zoom 125 % / 150 %: sin scroll global, ningÃºn panel queda cortado y las consignas se pueden crear, marcar y borrar completas.

### 4. EXPLORADOR: las bases se comprimÃ­an solas
- [x] Causa raÃ­z: el chequeo de conexiÃ³n cada 5 s llamaba `cargarBasesDeDatos()` y `renderizarExplorador()` rehacÃ­a el Ã¡rbol con `innerHTML=''`; la expansiÃ³n vivÃ­a solo en clases del DOM.
- [x] El estado de expansiÃ³n pasa a un `Set` en memoria (`basesExpandidas`, `tablasExpandidas`), independiente del DOM.
- [x] El polling ya no repinta el Ã¡rbol: solo recarga al pasar MySQL de caÃ­do a activo, con el botÃ³n "Refrescar" o tras un `CREATE/ALTER/DROP/RENAME/TRUNCATE`. Al recargar se restaura lo expandido.
- [x] El estado de expansiÃ³n se guarda en `data/` y se restaura al reabrir el programa.

### 5. EXPLORADOR: no se veÃ­an las tablas
- [x] Causa raÃ­z: las tablas sÃ­ se pintaban, pero fuera del Ã¡rea visible (falta de scroll por el problema 3) y al recontegro el polling se volvÃ­an a plegar (problema 4).
- [x] Backend: tablas y columnas se consultan por `information_schema` con `PreparedStatement` (sin concatenar nombres), y los endpoints devuelven `{tablas|columnas, error}` para que nada falle en silencio (antes se tragaba la excepciÃ³n y devolvÃ­a lista vacÃ­a).
- [x] Frontend: carga perezosa al expandir con "Cargandoâ€¦", "Sin tablas", error visible con botÃ³n "Reintentar", y cachÃ© de tablas y columnas.
- [x] Cada tabla se expande para ver sus columnas y tipos (doble clic en la columna la inserta en el editor).
- [x] Doble clic en una tabla genera ``SELECT * FROM `base`.`tabla` LIMIT 100``.
- [x] Las bases del sistema (`information_schema`, `mysql`, `performance_schema`, `sys`) van atenuadas en su propia secciÃ³n.

### VerificaciÃ³n
- [x] Suite automatizada (Edge headless + CDP, 29 checks) contra el build de desarrollo y contra el `.exe` empaquetado.
- [x] `.exe` ejecutado desde `C:\Users\...\Pruebas USB\SQL Alumnos` (ruta con espacios) y desde otra unidad simulada (`subst R:`): sin consola, `data\` y `logs\` junto al `.exe`, nada en la raÃ­z.
- [x] Arranque fallido verificado ocupando los puertos 8080-8090: mensaje en `logs\app.log` y diÃ¡logo en pantalla.

## Mejoras posteriores

### Base de datos activa (el desplegable del header ahora sirve)
- [x] Causa raÃ­z: `DatabaseService.obtenerConexion()` abrÃ­a siempre `jdbc:mariadb://host:puerto/` sin base, y `estado.baseDatosActiva` solo se usaba para el autocompletado; por eso el desplegable no tenÃ­a efecto y habÃ­a que escribir `USE`.
- [x] `DatabaseService` guarda la base activa y ejecuta `USE` sobre cada conexiÃ³n nueva; si la base no existe, se olvida y se sigue conectado al servidor.
- [x] Al arrancar se retoma la Ãºltima base usada (`ultimaBase` de las preferencias). Nuevo endpoint `POST /api/base-activa`.
- [x] Clic en el nombre de una base del EXPLORADOR la deja activa (la flecha sigue desplegando) y queda marcada en el Ã¡rbol.
- [x] Si el usuario ejecuta `USE x`, `CREATE DATABASE x` o `DROP DATABASE x`, el desplegable y la base activa se actualizan solos.

### DiÃ¡logos propios en lugar de los alerts del navegador
- [x] Los 11 `prompt`/`confirm`/`alert` nativos se reemplazaron por un modal propio (`pedirTexto` / `pedirConfirmacion`), con foco automÃ¡tico, Enter para aceptar, Escape para cancelar y botÃ³n de reintento.
- [x] "Agregado a favoritos" pasÃ³ a un aviso breve que no bloquea.

### Paneles ocultables
- [x] BotÃ³n de flecha visible en EXPLORADOR, CONSIGNAS e HISTORIAL (ademÃ¡s del clic en el encabezado).
- [x] Con las dos secciones del sidebar ocultas, la barra lateral y su divisor ocupan 0 px; el historial oculto tambiÃ©n, y en ambos casos aparece un botÃ³n en el borde para volver.
- [x] Atajos: F8 Explorador, F7 Consignas, F10 Historial, mÃ¡s el botÃ³n â˜° del header. El estado se guarda en `data\pestanas.json`.

### VerificaciÃ³n de las mejoras
- [x] Suite ampliada a 45 checks, en verde contra el build de desarrollo y contra el `.exe` empaquetado: base activa (desplegable, clic en el explorador y `USE` automÃ¡tico), consultas sin `USE` sobre la base elegida, modal de texto y de confirmaciÃ³n (crear, editar, borrar, desmarcar), ausencia de diÃ¡logos nativos, ocultado de los tres paneles con recuperaciÃ³n y ganancia de ancho real.

### Ãconos, sÃ­mbolos y barra divisoria del editor
- [x] **SÃ­mbolos raros en el EXPLORADOR**: dos causas. La primera, un bug propio: al recomponer los acentos de `app.js` quedaron 26 caracteres rotos (U+FFFD) en 18 lÃ­neas (Ã­conos de base y tabla, flechas, cierre de pestaÃ±as, barra de resultados y botones de consignas e historial). La segunda, los emojis no son fiables entre versiones de Windows.
- [x] Todos los Ã­conos pasaron a **SVG embebidos en el CSS** (`mask-image` + `currentColor`), asÃ­ que se ven iguales en cualquier PC y a cualquier zoom: base, tabla, flecha, refrescar, papelera, reloj, luna/sol, lÃ¡piz, estrella, cargar, cerrar, panel y play. La barra de resultados ahora usa texto ("Tiempo: 12 ms", "Filas: 5", "Filas afectadas: 3", aviso de truncado) en vez de Ã­conos.
- [x] **BotÃ³n flotante que tapaba la pestaÃ±a**: estaba en `top: 60px`, justo sobre la barra de pestaÃ±as (48 px + 36 px). BajÃ³ a `top: 92px` y se estrechÃ³ para molestar menos sobre el borde.
- [x] **Barra divisoria entre consultas y resultados**: ahora se arrastra de verdad. Causa raÃ­z: los resultados quedaban con `flex-basis` en porcentaje mientras el editor usaba base 0, asÃ­ que la barra se movÃ­a pero los paneles no. Ahora ambos se reparten la altura real del centro; la barra tiene 7 px de Ã¡rea Ãºtil con un tirador que aparece al pasar el mouse, el editor se recalcula durante el arrastre y el tamaÃ±o queda guardado.
- [x] Comprobado que subir la barra agranda la zona de resultados (para tablas grandes) y bajarla agranda la zona de consultas.
- [x] Suite ampliada a **53 checks** (en verde contra el build de desarrollo y contra el `.exe`): cero caracteres rotos y cero emojis en el cÃ³digo servido, Ã­conos dibujados con tamaÃ±o y color, botÃ³n flotante sin solapamiento con las pestaÃ±as, y arrastre de la divisoria en las dos direcciones.

### Logo del programa
- [x] `build/generar-icono.cjs` ahora genera los tres archivos de un mismo dibujo: `build/sqlalumnos.ico` (ejecutable), `public/favicon.ico` (pestaÃ±a del navegador) y `public/logo.svg` (header y favicon moderno). La geometrÃ­a de las letras estÃ¡ en una funciÃ³n compartida, asÃ­ que el Ã­cono del `.exe` y el del navegador son idÃ©nticos.
- [x] El SVG dibuja las letras con rectÃ¡ngulos (sin depender de fuentes), por lo que se ve igual en cualquier PC.
- [x] El header muestra el logo junto al nombre; en pantallas de menos de 520 px queda solo el Ã­cono.
- [x] `index.html` enlaza los tres: `rel="icon"` SVG, `rel="icon"` ICO y `apple-touch-icon`.
- [x] Suite ampliada a **55 checks** (en verde contra el build de desarrollo y contra el `.exe`): el logo carga y mide 22Ã—22, y favicon y SVG se sirven con el tipo correcto (`image/x-icon` e `image/svg+xml`).
