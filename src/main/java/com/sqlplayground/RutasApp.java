package com.sqlplayground;

import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Rutas base del programa.
 *
 * Resuelve la carpeta donde vive la aplicación (la que contiene al .exe
 * generado por jpackage) para que config.properties, data/ y logs/
 * queden SIEMPRE junto al ejecutable, sin importar el directorio de
 * trabajo desde el que se lance el programa.
 *
 * Estructura esperada de jpackage (--type app-image):
 *   SQLAlumnos.exe
 *   app/sql-alumnos.jar
 *   runtime/...
 * En ese caso la carpeta del programa es el padre de app/.
 *
 * En desarrollo (java -jar target/sql-alumnos.jar) se sube un nivel más
 * para trabajar sobre la raíz del proyecto.
 */
public final class RutasApp {

    private static Path carpetaApp;

    private RutasApp() {
    }

    /**
     * Devuelve la carpeta del programa (la del .exe), calculada una sola vez.
     */
    public static synchronized Path carpetaApp() {
        if (carpetaApp == null) {
            carpetaApp = resolverCarpeta();
        }
        return carpetaApp;
    }

    /**
     * Resuelve un archivo dentro de la carpeta del programa.
     * @param nombre nombre del archivo
     * @return ruta completa del archivo
     */
    public static Path archivo(String nombre) {
        return carpetaApp().resolve(nombre);
    }

    /**
     * Resuelve una subcarpeta de la carpeta del programa.
     * @param nombre nombre de la carpeta
     * @return ruta completa de la carpeta
     */
    public static Path carpeta(String nombre) {
        return carpetaApp().resolve(nombre);
    }

    /**
     * Lógica de resolución de la carpeta base.
     */
    private static Path resolverCarpeta() {
        // 1) Permitir forzar la ruta (útil para pruebas)
        String propiedad = System.getProperty("sqlalumnos.dir");
        if (propiedad != null && !propiedad.isBlank()) {
            return Paths.get(propiedad).toAbsolutePath().normalize();
        }

        // 2) Ubicación del propio jar/clase
        try {
            URL ubicacion = RutasApp.class.getProtectionDomain().getCodeSource().getLocation();
            Path ruta = Paths.get(ubicacion.toURI());

            // Si estamos dentro de un jar, la carpeta es la que lo contiene
            if (Files.isRegularFile(ruta)) {
                Path carpeta = ruta.getParent();
                String nombre = carpeta != null && carpeta.getFileName() != null
                        ? carpeta.getFileName().toString()
                        : "";
                // Carpeta de jpackage (app/) o de compilación de Maven (target/)
                if ("app".equalsIgnoreCase(nombre) || "target".equalsIgnoreCase(nombre)) {
                    return carpeta.getParent().toAbsolutePath().normalize();
                }
                return carpeta.toAbsolutePath().normalize();
            }

            // Ejecución desde classes/ sin empaquetar
            return ruta.toAbsolutePath().normalize();
        } catch (Exception e) {
            // 3) Último recurso: el directorio de trabajo
            return Paths.get(".").toAbsolutePath().normalize();
        }
    }
}