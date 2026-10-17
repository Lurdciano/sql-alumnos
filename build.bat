@echo off
REM ============================================================
REM SQL Alumnos - Compilacion y empaquetado
REM Genera dist\SQLAlumnos\SQLAlumnos.exe con jpackage (app-image),
REM incluyendo el runtime de Java. No requiere WiX ni instalador.
REM ============================================================
setlocal enabledelayedexpansion

echo.
echo ============================================================
echo SQL Alumnos - Compilando y generando el ejecutable
echo ============================================================
echo.

REM ------------------------------------------------------------
REM [0] Localizar un JDK 17 o superior (se necesita jpackage)
REM ------------------------------------------------------------
echo [0/5] Buscando un JDK 17 o superior con jpackage...

set "JPACKAGE="
set "JDK_DIR="

REM 1) JAVA_HOME
if defined JAVA_HOME (
    if exist "%JAVA_HOME%\bin\jpackage.exe" (
        set "JPACKAGE=%JAVA_HOME%\bin\jpackage.exe"
        for %%i in ("%JAVA_HOME%") do set "JDK_DIR=%%~fi"
    )
)

REM 2) jpackage en el PATH
if not defined JPACKAGE (
    for /f "delims=" %%j in ('where jpackage.exe 2^>nul') do (
        if not defined JPACKAGE (
            set "JPACKAGE=%%j"
            for %%i in ("%%~dpj") do set "JDK_DIR=%%~dpi"
        )
    )
)

REM 3) Derivarlo de la ruta de java (puede ser un JDK con jpackage en bin\)
if not defined JPACKAGE (
    for /f "delims=" %%j in ('where java.exe 2^>nul') do (
        if not defined JPACKAGE (
            if exist "%%~dpj..\jpackage.exe" (
                set "JPACKAGE=%%~dpj..\jpackage.exe"
                for %%i in ("%%~dpj..") do set "JDK_DIR=%%~fi"
            )
        )
    )
)

if not defined JPACKAGE (
    echo.
    echo ERROR: no se encontro "jpackage".
    echo.
    echo Se necesita un JDK 17 o superior, no un JRE, para generar el .exe:
    echo   - Instalalo desde https://adoptium.net - Temurin 17 o superior - o
    echo   - defini la variable JAVA_HOME apuntando al JDK, y volve a ejecutar.
    echo.
    pause
    exit /b 1
)

REM Verificar que el JDK sea usable (jpackage necesita un JDK, no un JRE)
"!JPACKAGE!" --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: "!JPACKAGE!" no se pudo ejecutar.
    echo Revisa que JAVA_HOME apunte a un JDK 17 o superior instalado.
    echo.
    pause
    exit /b 1
)

echo     JDK encontrado en !JDK_DIR!
echo     jpackage: !JPACKAGE!
echo.

REM ------------------------------------------------------------
REM [1] Compilar el proyecto
REM ------------------------------------------------------------
echo [1/5] Compilando el proyecto...
call mvnw.cmd clean package -q
if errorlevel 1 (
    echo.
    echo ERROR: la compilacion fallo.
    echo.
    pause
    exit /b 1
)

if not exist "target\sql-alumnos-1.0.0.jar" (
    echo.
    echo ERROR: no se genero target\sql-alumnos-1.0.0.jar
    echo.
    pause
    exit /b 1
)
echo     Compilacion exitosa.
echo.

REM ------------------------------------------------------------
REM [2] Icono
REM ------------------------------------------------------------
echo [2/5] Preparando el icono...
if not exist "build\sqlalumnos.ico" (
    echo     Generando build\sqlalumnos.ico...
    where node.exe >nul 2>&1
    if errorlevel 1 (
        echo     AVISO: no hay Node.js para generar el icono.
        echo     Se generara el ejecutable con el icono por defecto de Java.
        echo     Para el icono: node build\generar-icono.cjs
    ) else (
        node build\generar-icono.cjs
    )
) else (
    echo     Usando build\sqlalumnos.ico
)

REM El icono se pasa solo si el archivo existe
set "ICONO="
if exist "build\sqlalumnos.ico" set "ICONO=--icon build\sqlalumnos.ico"
echo.

REM ------------------------------------------------------------
REM [3] Preparar la entrada de jpackage
REM     Se copia el jar a build\in para que jpackage no tome
REM     otros jars que queden en target/
REM ------------------------------------------------------------
echo [3/5] Preparando los archivos del ejecutable...
if exist "build\in" rmdir /s /q "build\in"
mkdir "build\in"
copy "target\sql-alumnos-1.0.0.jar" "build\in\sql-alumnos.jar" >nul
if errorlevel 1 (
    echo.
    echo ERROR: no se pudo copiar el jar a build\in
    echo.
    pause
    exit /b 1
)
echo     Archivos listos.
echo.

REM ------------------------------------------------------------
REM [4] Generar el .exe con jpackage
REM     --type app-image  : genera la carpeta portable, sin instalador
REM     NO se pasa --win-console : el lanzador queda sin ventana de consola
REM ------------------------------------------------------------
echo [4/5] Generando SQLAlumnos.exe (jpackage, runtime Java incluido)...

if exist "dist\SQLAlumnos" rmdir /s /q "dist\SQLAlumnos"
if exist "dist\SQLAlumnos" (
    echo.
    echo ERROR: no se pudo borrar dist\SQLAlumnos.
    echo Cierra SQLAlumnos.exe si esta abierto y volve a ejecutar el build.
    echo.
    pause
    exit /b 1
)

"!JPACKAGE!" ^
    --type app-image ^
    --name SQLAlumnos ^
    --app-version 1.0.0 ^
    --description "SQL Alumnos" ^
    --vendor "SQL Alumnos" ^
    --input "build\in" ^
    --main-jar "sql-alumnos.jar" ^
    --dest "dist" ^
    %ICONO% ^
    --java-options "-Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8"

if errorlevel 1 (
    echo.
    echo ERROR: jpackage fallo. El ejecutable NO fue generado.
    echo Revisa que el JDK este completo: jpackage necesita el modulo jdk.jlink.
    echo.
    pause
    exit /b 1
)

if not exist "dist\SQLAlumnos\SQLAlumnos.exe" (
    echo.
    echo ERROR: jpackage no genero dist\SQLAlumnos\SQLAlumnos.exe
    echo.
    pause
    exit /b 1
)
echo     SQLAlumnos.exe generado.
echo.

REM ------------------------------------------------------------
REM [5] Dejar la carpeta lista para el usuario
REM ------------------------------------------------------------
echo [5/5] Preparando la carpeta del programa...

REM Configuracion junto al .exe (el programa tambien la crea si falta)
if exist "config.properties" (
    copy "config.properties" "dist\SQLAlumnos\config.properties" >nul
) else (
    echo db.host=localhost> "dist\SQLAlumnos\config.properties"
    echo db.puerto=3306>> "dist\SQLAlumnos\config.properties"
    echo db.usuario=root>> "dist\SQLAlumnos\config.properties"
    echo db.password=>> "dist\SQLAlumnos\config.properties"
)

REM Carpetas de datos y de registro
if not exist "dist\SQLAlumnos\data" mkdir "dist\SQLAlumnos\data"
if not exist "dist\SQLAlumnos\logs" mkdir "dist\SQLAlumnos\logs"

REM Quitar el lanzador .bat si quedara de una version anterior
if exist "dist\SQLAlumnos\SQLAlumnos.bat" del /q "dist\SQLAlumnos\SQLAlumnos.bat"

call :crear_leeme

REM ------------------------------------------------------------
REM Verificacion final
REM ------------------------------------------------------------
if not exist "dist\SQLAlumnos\SQLAlumnos.exe" (
    echo ERROR: falta el ejecutable dist\SQLAlumnos\SQLAlumnos.exe
    pause
    exit /b 1
)
if not exist "dist\SQLAlumnos\runtime\bin\server\jvm.dll" (
    echo ERROR: falta el runtime de Java en dist\SQLAlumnos\runtime
    pause
    exit /b 1
)
if not exist "dist\SQLAlumnos\LEEME.txt" (
    echo ERROR: falta LEEME.txt
    pause
    exit /b 1
)

echo.
echo ============================================================
echo Listo. Se genero el ejecutable con Java incluido.
echo ============================================================
echo.
echo   dist\SQLAlumnos\SQLAlumnos.exe   (ejecutable, sin ventana de consola)
echo   dist\SQLAlumnos\runtime\         (Java incluido)
echo   dist\SQLAlumnos\data\            (consignas, historial y preferencias)
echo   dist\SQLAlumnos\logs\            (registro del programa)
echo   dist\SQLAlumnos\LEEME.txt        (guia de uso)
echo.
echo Para usarlo:
echo   1. Copie la carpeta dist\SQLAlumnos\ a su pendrive
echo   2. Active MySQL desde XAMPP
echo   3. Ejecute SQLAlumnos.exe
echo.
pause
exit /b 0

REM ============================================================
REM LEEME.txt para usuarios no tecnicos
REM ============================================================
:crear_leeme
set "LEEME=dist\SQLAlumnos\LEEME.txt"
> "%LEEME%" echo ============================================================
>> "%LEEME%" echo  SQL ALUMNOS - Guia de uso rapida
>> "%LEEME%" echo ============================================================
>> "%LEEME%" echo.
>> "%LEEME%" echo QUE ES?
>> "%LEEME%" echo SQL Alumnos es una herramienta para practicar bases de datos.
>> "%LEEME%" echo Es similar a HeidiSQL, pero tiene un panel de consignas para
>> "%LEEME%" echo ir marcando tu progreso.
>> "%LEEME%" echo.
>> "%LEEME%" echo PASOS PARA USAR:
>> "%LEEME%" echo.
>> "%LEEME%" echo 1. Abrir XAMPP y activar MySQL
>> "%LEEME%" echo    - Abre el panel de control de XAMPP
>> "%LEEME%" echo    - Presiona "Start" en el modulo MySQL
>> "%LEEME%" echo    - Espera a que se ponga verde
>> "%LEEME%" echo.
>> "%LEEME%" echo 2. Ejecutar SQLAlumnos.exe
>> "%LEEME%" echo    - Ve a la carpeta del programa
>> "%LEEME%" echo    - Haz doble clic en SQLAlumnos.exe
>> "%LEEME%" echo    - Se abrira tu navegador automaticamente (sin ventanas negras)
>> "%LEEME%" echo    - Si no se abre, ve a http://127.0.0.1:8080
>> "%LEEME%" echo.
>> "%LEEME%" echo 3. Practicar con SQL
>> "%LEEME%" echo    - Elegi la base con la que vas a trabajar en el desplegable
>> "%LEEME%" echo      de arriba a la derecha (o haciendo clic en la base del EXPLORADOR)
>> "%LEEME%" echo    - Despliega una base con la flecha y despues una tabla
>> "%LEEME%" echo    - Escribe consultas en el editor central
>> "%LEEME%" echo    - Presiona Ctrl+Enter para ejecutar
>> "%LEEME%" echo    - Marca las consignas al completarlas
>> "%LEEME%" echo.
>> "%LEEME%" echo ATAJOS UTILES:
>> "%LEEME%" echo    Ctrl+Enter o F9  Ejecutar la consulta
>> "%LEEME%" echo    Ctrl+Espacio      Sugerencias de tablas
>> "%LEEME%" echo    F8                Mostrar u ocultar el EXPLORADOR
>> "%LEEME%" echo    F7                Mostrar u ocultar las CONSIGNAS
>> "%LEEME%" echo    F10               Mostrar u ocultar el HISTORIAL
>> "%LEEME%" echo    Doble clic en una tabla del explorador: genera el SELECT
>> "%LEEME%" echo    Clic en una base del explorador: deja esa base como activa
>> "%LEEME%" echo    Boton mas: nueva pestana de consulta
>> "%LEEME%" echo.
>> "%LEEME%" echo PROBLEMAS COMUNES:
>> "%LEEME%" echo.
>> "%LEEME%" echo "MySQL no esta activo"
>> "%LEEME%" echo    - Abre XAMPP y presiona Start en MySQL
>> "%LEEME%" echo    - El programa se conecta solo en cuanto MySQL esta activo
>> "%LEEME%" echo.
>> "%LEEME%" echo "El navegador no se abre"
>> "%LEEME%" echo    - Ve manualmente a http://127.0.0.1:8080
>> "%LEEME%" echo.
>> "%LEEME%" echo "No puedo guardar archivos"
>> "%LEEME%" echo    - Asegurate de que el pendrive no este protegido
>> "%LEEME%" echo      contra escritura (interruptor fisico en el lateral)
>> "%LEEME%" echo.
>> "%LEEME%" echo "Puerto 8080 ocupado"
>> "%LEEME%" echo    - Cierra otros programas que usen ese puerto
>> "%LEEME%" echo    - El programa prueba automaticamente con 8081, 8082, etc.
>> "%LEEME%" echo.
>> "%LEEME%" echo "El programa no abre"
>> "%LEEME%" echo    - Mira el archivo logs\app.log: ahi queda anotado el motivo
>> "%LEEME%" echo.
>> "%LEEME%" echo CARACTERISTICAS:
>> "%LEEME%" echo.
>> "%LEEME%" echo - Editor SQL con resaltado de sintaxis
>> "%LEEME%" echo - Multiples pestanas de consulta
>> "%LEEME%" echo - Explorador de bases de datos, tablas y columnas
>> "%LEEME%" echo - Panel de consignas con checkbox y progreso
>> "%LEEME%" echo - Historial de consultas y favoritos
>> "%LEEME%" echo - Paneles plegables y redimensionables
>> "%LEEME%" echo - Tema claro / oscuro
>> "%LEEME%" echo - Todo se guarda en la carpeta data\ (junto al programa)
>> "%LEEME%" echo.
>> "%LEEME%" echo NOTAS:
>> "%LEEME%" echo.
>> "%LEEME%" echo - Todo se guarda localmente en la carpeta data\
>> "%LEEME%" echo - Puedes copiar la carpeta a un pendrive y usarla en otra PC
>> "%LEEME%" echo - No requiere conexion a internet
>> "%LEEME%" echo - No requiere instalar nada (Java ya viene incluido)
>> "%LEEME%" echo.
>> "%LEEME%" echo ============================================================
>> "%LEEME%" echo  Buen trabajo con tus practicas
>> "%LEEME%" echo ============================================================
goto :eof