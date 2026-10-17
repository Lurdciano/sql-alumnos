package com.sqlplayground;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Servicio de configuración.
 * Lee y escribe config.properties en la carpeta del programa (junto al .exe).
 */
public class ConfigService {

    private static final String ARCHIVO_CONFIG = "config.properties";

    /** Carpeta del programa, resuelta desde la ubicación del jar. */
    private static final Path CARPETA_APP = RutasApp.carpetaApp();

    // Valores por defecto para XAMPP
    private static final String HOST_DEFAULT = "localhost";
    private static final int PUERTO_DB_DEFAULT = 3306;
    private static final String USUARIO_DEFAULT = "root";
    private static final String PASSWORD_DEFAULT = "";

    private final Properties properties;

    public ConfigService() {
        properties = new Properties();
        cargarConfiguracion();
    }

    /**
     * Carga la configuración desde config.properties.
     * Si no existe, lo crea con los valores por defecto.
     */
    private void cargarConfiguracion() {
        File archivo = CARPETA_APP.resolve(ARCHIVO_CONFIG).toFile();
        if (archivo.exists()) {
            try (FileInputStream fis = new FileInputStream(archivo)) {
                properties.load(fis);
            } catch (IOException e) {
                System.err.println("Error leyendo config.properties: " + e.getMessage());
                establecerDefaults();
            }
        } else {
            establecerDefaults();
            guardarConfiguracion();
        }
    }

    /**
     * Establece los valores por defecto y los guarda.
     */
    private void establecerDefaults() {
        properties.setProperty("db.host", HOST_DEFAULT);
        properties.setProperty("db.puerto", String.valueOf(PUERTO_DB_DEFAULT));
        properties.setProperty("db.usuario", USUARIO_DEFAULT);
        properties.setProperty("db.password", PASSWORD_DEFAULT);
    }

    /**
     * Guarda la configuración actual en config.properties.
     */
    public void guardarConfiguracion() {
        try (FileOutputStream fos = new FileOutputStream(CARPETA_APP.resolve(ARCHIVO_CONFIG).toFile())) {
            properties.store(fos, "Configuración de SQL Playground");
        } catch (IOException e) {
            System.err.println("Error guardando config.properties: " + e.getMessage());
        }
    }

    public String getHost() {
        return properties.getProperty("db.host", HOST_DEFAULT);
    }

    public int getPuertoDb() {
        try {
            return Integer.parseInt(properties.getProperty("db.puerto", String.valueOf(PUERTO_DB_DEFAULT)));
        } catch (NumberFormatException e) {
            return PUERTO_DB_DEFAULT;
        }
    }

    public String getUsuario() {
        return properties.getProperty("db.usuario", USUARIO_DEFAULT);
    }

    public String getPassword() {
        return properties.getProperty("db.password", PASSWORD_DEFAULT);
    }
}
