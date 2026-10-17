package com.sqlplayground;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Servicio de almacenamiento en archivos JSON.
 * Guarda datos en la carpeta data/ dentro de la carpeta del programa
 * (junto al .exe), para que se conserven al cambiar de PC o de pendrive.
 */
public class StorageService {

    private static final String CARPETA_DATA = "data";
    private final Gson gson;
    private final Path rutaData;

    public StorageService() {
        this.gson = new GsonBuilder().setPrettyPrinting().create();
        this.rutaData = RutasApp.carpeta(CARPETA_DATA);
        crearCarpetaSiNoExiste();
    }

    /**
     * Devuelve la ruta de la carpeta data/ (para mostrarla en la interfaz).
     */
    public Path getRutaData() {
        return rutaData;
    }

    /**
     * Crea la carpeta data/ si no existe.
     */
    private void crearCarpetaSiNoExiste() {
        try {
            if (!Files.exists(rutaData)) {
                Files.createDirectories(rutaData);
            }
        } catch (IOException e) {
            System.err.println("Error creando carpeta data/: " + e.getMessage());
        }
    }

    /**
     * Verifica si la carpeta data/ es escribible.
     */
    public boolean esEscribible() {
        try {
            if (!Files.exists(rutaData)) {
                Files.createDirectories(rutaData);
            }
            Path testFile = rutaData.resolve(".test");
            Files.write(testFile, "test".getBytes(StandardCharsets.UTF_8));
            Files.delete(testFile);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * Guarda un objeto como JSON en un archivo dentro de data/.
     * @param nombreArchivo nombre del archivo (sin ruta)
     * @param objeto objeto a serializar
     * @return true si se guardó correctamente
     */
    public boolean guardar(String nombreArchivo, Object objeto) {
        try {
            Path rutaArchivo = rutaData.resolve(nombreArchivo);
            String json = gson.toJson(objeto);
            Files.write(rutaArchivo, json.getBytes(StandardCharsets.UTF_8));
            return true;
        } catch (IOException e) {
            System.err.println("Error guardando " + nombreArchivo + ": " + e.getMessage());
            return false;
        }
    }

    /**
     * Carga un objeto JSON desde un archivo dentro de data/.
     * @param nombreArchivo nombre del archivo (sin ruta)
     * @param clase clase del objeto a deserializar
     * @param <T> tipo genérico
     * @return objeto deserializado, o null si no existe o hay error
     */
    public <T> T cargar(String nombreArchivo, Class<T> clase) {
        try {
            Path rutaArchivo = rutaData.resolve(nombreArchivo);
            if (!Files.exists(rutaArchivo)) {
                return null;
            }
            String json = new String(Files.readAllBytes(rutaArchivo), StandardCharsets.UTF_8);
            return gson.fromJson(json, clase);
        } catch (IOException e) {
            System.err.println("Error cargando " + nombreArchivo + ": " + e.getMessage());
            return null;
        }
    }

    /**
     * Verifica si un archivo existe en data/.
     */
    public boolean existe(String nombreArchivo) {
        return Files.exists(rutaData.resolve(nombreArchivo));
    }

    /**
     * Elimina un archivo de data/.
     */
    public boolean eliminar(String nombreArchivo) {
        try {
            return Files.deleteIfExists(rutaData.resolve(nombreArchivo));
        } catch (IOException e) {
            System.err.println("Error eliminando " + nombreArchivo + ": " + e.getMessage());
            return false;
        }
    }
}
