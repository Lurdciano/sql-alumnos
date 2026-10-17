# AGENTS.md

## Proyecto
SQL Alumnos: programa portable para Windows (estilo HeidiSQL, con panel de consignas con checkbox). Especificación completa en `SPEC.md`. Estado y tareas en `PROGRESS.md`.

## Reglas obligatorias
- Los usuarios finales NO ven el código: el entregable es `dist/SQLAlumnos/SQLAlumnos.exe`.
- Debe funcionar sin Java instalado, sin internet y sin permisos de administrador.
- Prohibido usar CDN: todas las librerías (CodeMirror, CSS, fuentes) van incluidas localmente.
- Datos de usuario en archivos JSON dentro de `data/` junto al .exe, nunca en `localStorage`.
- No añadir dependencias ni funciones fuera de `SPEC.md`. Si algo no está claro, preguntar antes.
- Comentarios del código en español.

## Stack
Java 17+, Javalin, JDBC con `mariadb-java-client`, Maven. Frontend en HTML/CSS/JS plano.

## Entorno
- Windows. MySQL/MariaDB de XAMPP en `localhost:3306`, usuario `root`, sin contraseña.
- Para probar: iniciar MySQL desde el panel de XAMPP antes de ejecutar.

## Comandos
- Compilar: `.\mvnw.cmd clean package`
- Ejecutar en desarrollo: `java -jar target/sql-alumnos-1.0.0.jar`
- Generar el ejecutable: `build.bat`

## Flujo de trabajo
- Trabajar por fases (ver `PROGRESS.md`) y marcar cada tarea al terminarla.
- Verificar que compila y que la fase funciona antes de pasar a la siguiente.
- No reescribir archivos que ya funcionan sin motivo.