package com.sqlplayground;

import java.util.*;

/**
 * Servicio de pestañas de consulta y preferencias.
 * Persiste en data/pestanas.json.
 */
public class PestanasService {

    private static final String ARCHIVO_PESTANAS = "pestanas.json";
    private final StorageService storage;
    private PestanasData datos;

    public PestanasService(StorageService storage) {
        this.storage = storage;
        cargarDatos();
    }

    /**
     * Carga los datos desde el archivo JSON.
     */
    private void cargarDatos() {
        datos = storage.cargar(ARCHIVO_PESTANAS, PestanasData.class);
        if (datos == null) {
            datos = new PestanasData();
            datos.pestanas = new ArrayList<>();
            datos.preferencias = new Preferencias();
        }
    }

    /**
     * Guarda los datos en el archivo JSON.
     */
    public void guardar() {
        storage.guardar(ARCHIVO_PESTANAS, datos);
    }

    /**
     * Obtiene todas las pestañas.
     */
    public List<Pestana> obtenerPestanas() {
        return datos.pestanas;
    }

    /**
     * Agrega una nueva pestaña.
     */
    public Pestana agregarPestana(String nombre, String contenido) {
        Pestana p = new Pestana();
        p.id = UUID.randomUUID().toString();
        p.nombre = nombre;
        p.contenido = contenido;
        datos.pestanas.add(p);
        guardar();
        return p;
    }

    /**
     * Actualiza el contenido de una pestaña.
     */
    public void actualizarContenido(String id, String contenido) {
        datos.pestanas.stream()
            .filter(p -> p.id.equals(id))
            .findFirst()
            .ifPresent(p -> {
                p.contenido = contenido;
                guardar();
            });
    }

    /**
     * Actualiza el nombre de una pestaña.
     */
    public void actualizarNombre(String id, String nombre) {
        datos.pestanas.stream()
            .filter(p -> p.id.equals(id))
            .findFirst()
            .ifPresent(p -> {
                p.nombre = nombre;
                guardar();
            });
    }

    /**
     * Elimina una pestaña.
     */
    public void eliminarPestana(String id) {
        datos.pestanas.removeIf(p -> p.id.equals(id));
        guardar();
    }

    /**
     * Obtiene las preferencias.
     */
    public Preferencias obtenerPreferencias() {
        return datos.preferencias;
    }

    /**
     * Actualiza el tema.
     */
    public void actualizarTema(String tema) {
        datos.preferencias.tema = tema;
        guardar();
    }

    /**
     * Actualiza la última base de datos usada.
     */
    public void actualizarUltimaBase(String base) {
        datos.preferencias.ultimaBase = base;
        guardar();
    }

    /**
     * Actualiza el layout de la interfaz (tamaños, paneles plegados,
     * bases expandidas). Se guarda tal cual llega para no perder campos.
     */
    public void actualizarLayout(Map<String, Object> layout) {
        datos.preferencias.layout = layout;
        guardar();
    }

    // ===== Clases de datos =====

    public static class PestanasData {
        public List<Pestana> pestanas;
        public Preferencias preferencias;
    }

    public static class Pestana {
        public String id;
        public String nombre;
        public String contenido;
    }

    public static class Preferencias {
        public String tema = "dark";
        public String ultimaBase = null;
        /** Layout de la interfaz y estado del explorador (tamaños y paneles). */
        public Map<String, Object> layout = new LinkedHashMap<>();
    }
}
