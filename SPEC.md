# ESPECIFICACIÓN: SQL Alumnos

## Qué es y cómo se usa
Programa portable para Windows que usan estudiantes de bases de datos como alternativa a HeidiSQL, con un añadido: un panel de **consignas con checkbox** (hoy lo resuelven con una nota de texto aparte). Los usuarios NO verán ni tocarán el código.

**Rutina de uso:**
1. Abrir XAMPP y activar MySQL.
2. Ejecutar `SQLAlumnos.exe`.
3. Se abre el navegador con la aplicación; todo se usa desde ahí.

**Requisito clave:** la carpeta del programa se copia a un pendrive y funciona en cualquier PC con Windows **sin instalar nada** (ni Java, ni Maven, ni permisos de administrador) y **sin internet**.

## Stack y empaquetado
- **Backend:** Java 17+ con Javalin y JDBC puro. Usar el driver **MariaDB** (`mariadb-java-client`), porque XAMPP trae MariaDB y también conecta con MySQL.
- **Frontend:** HTML, CSS y JavaScript plano, servido por el mismo backend. **Prohibido usar CDN**: todo (editor, CSS, fuentes, iconos) va incluido localmente. CSS propio o Tailwind precompilado.
- **Empaquetado:** `jpackage --type app-image` (con runtime Java incluido vía jlink) para generar la carpeta `dist/SQLPlayground/` con `SQLPlayground.exe` dentro. Debe poder generarse con un `build.bat` y no requerir WiX ni instalador.
- **Al ejecutar el .exe:**
  - Arranca el servidor en `127.0.0.1` (puerto 8080; si está ocupado, probar los siguientes).
  - Abre el navegador predeterminado con la URL correcta.
  - Si ya hay una instancia abierta, solo abre el navegador de nuevo, sin lanzar otra.
  - Sin ventana de consola visible. Botón "Cerrar programa" en la UI que apaga el servidor limpiamente (y cierre automático si la pestaña lleva ~1 min sin responder).

## Conexión a MySQL
- Valores por defecto de XAMPP: `localhost:3306`, usuario `root`, contraseña vacía.
- Archivo `config.properties` junto al .exe para cambiarlos, y también un diálogo "Conexión" en la UI.
- Al abrir y cada pocos segundos, detectar si MySQL está activo. Si no lo está, mostrar un aviso claro ("MySQL no está activo. Ábrelo desde XAMPP y presiona Reintentar") en vez de errores técnicos, y reconectar solo cuando se active.
- Indicador de estado en el header (verde/rojo).

## Funciones SQL (deben comportarse como HeidiSQL)
- **Explorador lateral:** lista de bases de datos y, al expandir, sus tablas (con columnas y tipos). Doble clic en una tabla genera `SELECT * FROM tabla LIMIT 100`. Selector de base de datos activa.
- **Editor SQL con resaltado de sintaxis** estilo HeidiSQL (usar CodeMirror 5 o 6 incluido localmente, modo SQL MySQL):
  - Palabras clave (`SELECT, FROM, WHERE, ALTER, AND, OR, JOIN, GROUP BY…`) en azul/negrita.
  - Cadenas en rojo, números en otro color, comentarios (`--`, `#`, `/* */`) en gris o verde, funciones (`COUNT`, `SUM`…) destacadas, y backticks para identificadores.
  - Numeración de líneas, autoindentado, cierre de paréntesis y comillas.
  - Autocompletado de palabras clave y de nombres de tablas/columnas de la base activa (deseable).
- **Pestañas de consulta** (varias consultas abiertas a la vez, renombrables, con contenido guardado).
- **Ejecución:**
  - `Ctrl+Enter` / `F9`: ejecutar lo seleccionado o, si no hay selección, todo el contenido.
  - Soportar varias sentencias separadas por `;` (respetando cadenas, comentarios y `DELIMITER`), y mostrar un resultado por cada sentencia en pestañas de resultados.
  - Permitir cualquier sentencia (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `USE`, etc.) sin restricciones, igual que HeidiSQL.
- **Resultados:** grilla con encabezado fijo, `NULL` en gris cursiva, scroll, y barra con tiempo de ejecución y filas devueltas o afectadas. Límite de 1000 filas mostradas, avisando si se truncó. Opción de copiar y exportar a CSV. Escapar el contenido de celdas (sin `innerHTML`).
- **Errores:** mostrar el mensaje de MySQL con su código, resaltando la sentencia que falló. Nunca romper el servidor ni mostrar stack traces.

## Consignas con checklist (la función nueva)
- Panel lateral de consignas, **editable desde la propia app**: agregar, editar, eliminar y reordenar (arrastrar).
- Cada consigna con checkbox, y progreso total ("4/10").
- Permitir varios **conjuntos de consignas** (p. ej. "Práctica 1", "Parcial"), crear, renombrar y cambiar entre ellos.
- Importar y exportar un conjunto como archivo de texto/JSON para compartirlo con compañeros.
- Atajo para pegar un bloque de texto con una consigna por línea y convertirlo en lista.
- Botón "Desmarcar todas".

## Persistencia (importante para el pendrive)
No usar `localStorage` como almacenamiento principal, porque se pierde al cambiar de PC o de puerto. Guardar todo en archivos JSON dentro de una carpeta `data/` junto al .exe, mediante la API del backend:
- Consignas y su estado de checkbox.
- Historial de consultas exitosas (máx. 100, sin duplicados consecutivos) y favoritos.
- Pestañas de consulta abiertas y preferencias (tema, última base usada).
Si `data/` no existe, crearla. Si no se puede escribir (pendrive de solo lectura), avisar en la UI.

## Interfaz
- Header: nombre, estado de conexión, selector de base de datos, botón de tema claro/oscuro y cerrar.
- Izquierda (con secciones plegables): explorador de bases y tablas, y consignas.
- Centro/derecha: pestañas de consulta con editor, resultados debajo y panel de historial/favoritos (cargar en editor, marcar favorito, eliminar).
- Paneles redimensionables, atajos de teclado visibles.

## Entregables
1. Código fuente organizado y comentado en español (controlador, servicio SQL, almacenamiento, configuración).
2. `build.bat` que compila y genera `dist/SQLAlumnos/SQLAlumnos.exe`.
3. `LEEME.txt` en la carpeta final, para usuarios no técnicos, con los 3 pasos de uso y soluciones a problemas comunes (MySQL apagado, puerto ocupado, navegador no abre).
4. No añadir funciones ni dependencias fuera de lo pedido.

## Criterios de aceptación
- Copiar `dist/SQLAlumnos/` a un pendrive y ejecutarlo en una PC sin Java ni internet: funciona.
- Con MySQL apagado muestra el aviso, y al activarlo en XAMPP conecta solo.
- El resaltado de sintaxis muestra los colores típicos en `SELECT`, `ALTER`, `AND`, cadenas, números y comentarios.
- Se pueden ejecutar varias sentencias a la vez y ver cada resultado por separado.
- Las consignas, los checkboxes y el historial siguen ahí tras cerrar el programa y abrirlo en otra PC con la misma carpeta.