package com.sqlplayground;

import java.util.*;

/**
 * Servicio de historial y favoritos de consultas.
 * Persiste en data/historial.json y data/favoritos.json.
 */
public class HistorialService {

    private static final String ARCHIVO_HISTORIAL = "historial.json";
    private static final String ARCHIVO_FAVORITOS = "favoritos.json";
    private static final int MAX_HISTORIAL = 100;

    private final StorageService storage;
    private List<EntradaHistorial> historial;
    private List<EntradaFavorito> favoritos;

    public HistorialService(StorageService storage) {
        this.storage = storage;
        cargarDatos();
    }

    /**
     * Carga los datos desde los archivos JSON.
     */
    private void cargarDatos() {
        HistorialData histData = storage.cargar(ARCHIVO_HISTORIAL, HistorialData.class);
        if (histData != null) {
            historial = histData.entradas;
        } else {
            historial = new ArrayList<>();
        }

        FavoritosData favData = storage.cargar(ARCHIVO_FAVORITOS, FavoritosData.class);
        if (favData != null) {
            favoritos = favData.entradas;
        } else {
            favoritos = new ArrayList<>();
        }
    }

    /**
     * Agrega una consulta al historial (si no es duplicada consecutivamente).
     */
    public void agregarAlHistorial(String sql) {
        if (sql == null || sql.trim().isEmpty()) return;

        String sqlLimpio = sql.trim();

        // No agregar si es igual a la última entrada
        if (!historial.isEmpty() && historial.get(historial.size() - 1).sql.equals(sqlLimpio)) {
            return;
        }

        EntradaHistorial entrada = new EntradaHistorial();
        entrada.id = UUID.randomUUID().toString();
        entrada.sql = sqlLimpio;
        entrada.fecha = System.currentTimeMillis();

        historial.add(entrada);

        // Limitar a MAX_HISTORIAL entradas
        if (historial.size() > MAX_HISTORIAL) {
            historial = historial.subList(historial.size() - MAX_HISTORIAL, historial.size());
        }

        guardarHistorial();
    }

    /**
     * Obtiene el historial completo.
     */
    public List<EntradaHistorial> obtenerHistorial() {
        return new ArrayList<>(historial);
    }

    /**
     * Elimina una entrada del historial.
     */
    public void eliminarDelHistorial(String id) {
        historial.removeIf(e -> e.id.equals(id));
        guardarHistorial();
    }

    /**
     * Limpia todo el historial.
     */
    public void limpiarHistorial() {
        historial.clear();
        guardarHistorial();
    }

    /**
     * Agrega una consulta a favoritos.
     */
    public EntradaFavorito agregarAFavoritos(String sql, String nombre) {
        if (sql == null || sql.trim().isEmpty()) return null;

        EntradaFavorito fav = new EntradaFavorito();
        fav.id = UUID.randomUUID().toString();
        fav.sql = sql.trim();
        fav.nombre = nombre != null && !nombre.trim().isEmpty() ? nombre.trim() : sql.trim().substring(0, Math.min(50, sql.trim().length()));
        fav.fecha = System.currentTimeMillis();

        favoritos.add(fav);
        guardarFavoritos();
        return fav;
    }

    /**
     * Obtiene todos los favoritos.
     */
    public List<EntradaFavorito> obtenerFavoritos() {
        return new ArrayList<>(favoritos);
    }

    /**
     * Elimina un favorito.
     */
    public void eliminarDeFavoritos(String id) {
        favoritos.removeIf(f -> f.id.equals(id));
        guardarFavoritos();
    }

    /**
     * Marca una consulta del historial como favorito.
     */
    public EntradaFavorito marcarComoFavorito(String idHistorial) {
        EntradaHistorial entrada = historial.stream()
            .filter(e -> e.id.equals(idHistorial))
            .findFirst()
            .orElse(null);

        if (entrada == null) return null;

        return agregarAFavoritos(entrada.sql, null);
    }

    private void guardarHistorial() {
        HistorialData data = new HistorialData();
        data.entradas = historial;
        storage.guardar(ARCHIVO_HISTORIAL, data);
    }

    private void guardarFavoritos() {
        FavoritosData data = new FavoritosData();
        data.entradas = favoritos;
        storage.guardar(ARCHIVO_FAVORITOS, data);
    }

    // ===== Clases de datos =====

    public static class HistorialData {
        public List<EntradaHistorial> entradas;
    }

    public static class EntradaHistorial {
        public String id;
        public String sql;
        public long fecha;
    }

    public static class FavoritosData {
        public List<EntradaFavorito> entradas;
    }

    public static class EntradaFavorito {
        public String id;
        public String sql;
        public String nombre;
        public long fecha;
    }
}
