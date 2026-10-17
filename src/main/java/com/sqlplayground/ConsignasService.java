package com.sqlplayground;

import java.util.*;

/**
 * Servicio de consignas con checkbox.
 * Gestiona conjuntos de consignas y su persistencia en data/consignas.json.
 */
public class ConsignasService {

    private static final String ARCHIVO_CONSIGNAS = "consignas.json";
    private final StorageService storage;
    private ConsignasData datos;

    public ConsignasService(StorageService storage) {
        this.storage = storage;
        cargarDatos();
    }

    /**
     * Carga los datos desde el archivo JSON.
     */
    private void cargarDatos() {
        datos = storage.cargar(ARCHIVO_CONSIGNAS, ConsignasData.class);
        if (datos == null) {
            datos = new ConsignasData();
            datos.conjuntos = new ArrayList<>();
            datos.conjuntoActivo = null;
            // Crear conjunto por defecto
            crearConjunto("Práctica 1");
        }
    }

    /**
     * Guarda los datos en el archivo JSON.
     */
    public void guardar() {
        storage.guardar(ARCHIVO_CONSIGNAS, datos);
    }

    /**
     * Obtiene todos los conjuntos de consignas.
     */
    public List<ConjuntoConsignas> obtenerConjuntos() {
        return datos.conjuntos;
    }

    /**
     * Obtiene el conjunto activo.
     */
    public ConjuntoConsignas obtenerConjuntoActivo() {
        if (datos.conjuntoActivo == null) return null;
        return datos.conjuntos.stream()
            .filter(c -> c.id.equals(datos.conjuntoActivo))
            .findFirst()
            .orElse(null);
    }

    /**
     * Crea un nuevo conjunto de consignas.
     */
    public ConjuntoConsignas crearConjunto(String nombre) {
        ConjuntoConsignas conjunto = new ConjuntoConsignas();
        conjunto.id = UUID.randomUUID().toString();
        conjunto.nombre = nombre;
        conjunto.consignas = new ArrayList<>();
        datos.conjuntos.add(conjunto);
        datos.conjuntoActivo = conjunto.id;
        guardar();
        return conjunto;
    }

    /**
     * Cambia el conjunto activo.
     */
    public void activarConjunto(String id) {
        datos.conjuntoActivo = id;
        guardar();
    }

    /**
     * Renombra un conjunto.
     */
    public void renombrarConjunto(String id, String nuevoNombre) {
        datos.conjuntos.stream()
            .filter(c -> c.id.equals(id))
            .findFirst()
            .ifPresent(c -> {
                c.nombre = nuevoNombre;
                guardar();
            });
    }

    /**
     * Elimina un conjunto.
     */
    public void eliminarConjunto(String id) {
        datos.conjuntos.removeIf(c -> c.id.equals(id));
        if (datos.conjuntoActivo != null && datos.conjuntoActivo.equals(id)) {
            datos.conjuntoActivo = datos.conjuntos.isEmpty() ? null : datos.conjuntos.get(0).id;
        }
        guardar();
    }

    /**
     * Agrega una consigna al conjunto activo.
     */
    public Consigna agregarConsigna(String texto) {
        ConjuntoConsignas conjunto = obtenerConjuntoActivo();
        if (conjunto == null) return null;

        Consigna consigna = new Consigna();
        consigna.id = UUID.randomUUID().toString();
        consigna.texto = texto;
        consigna.completada = false;
        conjunto.consignas.add(consigna);
        guardar();
        return consigna;
    }

    /**
     * Agrega múltiples consignas desde un texto (una por línea).
     */
    public List<Consigna> agregarConsignasDesdeTexto(String texto) {
        List<Consigna> nuevas = new ArrayList<>();
        String[] lineas = texto.split("\\r?\\n");
        for (String linea : lineas) {
            String trimmed = linea.trim();
            if (!trimmed.isEmpty()) {
                Consigna c = agregarConsigna(trimmed);
                if (c != null) nuevas.add(c);
            }
        }
        return nuevas;
    }

    /**
     * Edita una consigna.
     */
    public void editarConsigna(String id, String nuevoTexto) {
        ConjuntoConsignas conjunto = obtenerConjuntoActivo();
        if (conjunto == null) return;

        conjunto.consignas.stream()
            .filter(c -> c.id.equals(id))
            .findFirst()
            .ifPresent(c -> {
                c.texto = nuevoTexto;
                guardar();
            });
    }

    /**
     * Elimina una consigna.
     */
    public void eliminarConsigna(String id) {
        ConjuntoConsignas conjunto = obtenerConjuntoActivo();
        if (conjunto == null) return;

        conjunto.consignas.removeIf(c -> c.id.equals(id));
        guardar();
    }

    /**
     * Marca/desmarca una consigna.
     */
    public void toggleConsigna(String id) {
        ConjuntoConsignas conjunto = obtenerConjuntoActivo();
        if (conjunto == null) return;

        conjunto.consignas.stream()
            .filter(c -> c.id.equals(id))
            .findFirst()
            .ifPresent(c -> {
                c.completada = !c.completada;
                guardar();
            });
    }

    /**
     * Desmarca todas las consignas del conjunto activo.
     */
    public void desmarcarTodas() {
        ConjuntoConsignas conjunto = obtenerConjuntoActivo();
        if (conjunto == null) return;

        conjunto.consignas.forEach(c -> c.completada = false);
        guardar();
    }

    /**
     * Reordena una consigna (mover arriba/abajo).
     */
    public void reordenarConsigna(String id, int direccion) {
        ConjuntoConsignas conjunto = obtenerConjuntoActivo();
        if (conjunto == null) return;

        int index = -1;
        for (int i = 0; i < conjunto.consignas.size(); i++) {
            if (conjunto.consignas.get(i).id.equals(id)) {
                index = i;
                break;
            }
        }

        if (index == -1) return;

        int nuevoIndex = index + direccion;
        if (nuevoIndex < 0 || nuevoIndex >= conjunto.consignas.size()) return;

        Collections.swap(conjunto.consignas, index, nuevoIndex);
        guardar();
    }

    /**
     * Obtiene el progreso del conjunto activo.
     */
    public Progreso obtenerProgreso() {
        ConjuntoConsignas conjunto = obtenerConjuntoActivo();
        if (conjunto == null) return new Progreso(0, 0);

        long completadas = conjunto.consignas.stream().filter(c -> c.completada).count();
        return new Progreso((int) completadas, conjunto.consignas.size());
    }

    /**
     * Exporta un conjunto como JSON.
     */
    public String exportarConjunto(String id) {
        return datos.conjuntos.stream()
            .filter(c -> c.id.equals(id))
            .findFirst()
            .map(c -> new com.google.gson.GsonBuilder().setPrettyPrinting().create().toJson(c))
            .orElse(null);
    }

    /**
     * Importa un conjunto desde JSON.
     */
    public ConjuntoConsignas importarConjunto(String json) {
        try {
            ConjuntoConsignas conjunto = new com.google.gson.Gson().fromJson(json, ConjuntoConsignas.class);
            if (conjunto != null && conjunto.nombre != null) {
                conjunto.id = UUID.randomUUID().toString();
                datos.conjuntos.add(conjunto);
                guardar();
                return conjunto;
            }
        } catch (Exception e) {
            System.err.println("Error importando conjunto: " + e.getMessage());
        }
        return null;
    }

    // ===== Clases de datos =====

    public static class ConsignasData {
        public List<ConjuntoConsignas> conjuntos;
        public String conjuntoActivo;
    }

    public static class ConjuntoConsignas {
        public String id;
        public String nombre;
        public List<Consigna> consignas;
    }

    public static class Consigna {
        public String id;
        public String texto;
        public boolean completada;
    }

    public static class Progreso {
        public int completadas;
        public int total;

        public Progreso(int completadas, int total) {
            this.completadas = completadas;
            this.total = total;
        }
    }
}
