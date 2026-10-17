package com.sqlplayground;

import io.javalin.Javalin;
import io.javalin.http.staticfiles.Location;

import javax.swing.JOptionPane;
import java.awt.Desktop;
import java.io.IOException;
import java.io.PrintStream;
import java.net.ServerSocket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Punto de entrada de SQL Alumnos.
 * Arranca el servidor Javalin y abre el navegador predeterminado.
 * Funciona sin ventana de consola: los logs van a logs/app.log.
 */
public class Main {

    private static final int PUERTO_INICIAL = 8080;
    private static final int PUERTO_MAXIMO = 8090;

    /** Tamaño máximo del log antes de rotarlo (2 MB). */
    private static final long TAMANO_MAXIMO_LOG = 2L * 1024 * 1024;

    public static void main(String[] args) {
        // Sin consola: toda la salida va a logs/app.log
        configurarLogs();

        try {
            iniciar();
        } catch (Throwable e) {
            mostrarErrorFatal("No se pudo iniciar el programa: " + descripcionError(e));
            System.exit(1);
        }
    }

    /**
     * Arranca el servidor y abre el navegador.
     */
    private static void iniciar() {
        // Cargar configuración desde config.properties
        ConfigService config = new ConfigService();

        // Crear servicios
        DatabaseService dbService = new DatabaseService(config);
        QueryService queryService = new QueryService(dbService);
        StorageService storage = new StorageService();
        ConsignasService consignasService = new ConsignasService(storage);
        HistorialService historialService = new HistorialService(storage);
        PestanasService pestanasService = new PestanasService(storage);

        // Determinar puerto disponible
        int puerto = encontrarPuertoLibre();
        if (puerto == -1) {
            mostrarErrorFatal("No se encontró un puerto libre entre " + PUERTO_INICIAL + " y " + PUERTO_MAXIMO
                    + ".\nCerrá los otros programas que puedan estar usándolo y volvé a intentar.\n"
                    + "El detalle está en " + rutaLog().toString());
            System.exit(1);
        }

        // Configurar Javalin
        Javalin app;
        try {
            app = Javalin.create(configJavalin -> {
                configJavalin.staticFiles.add("/public", Location.CLASSPATH);
                configJavalin.showJavalinBanner = false;
            }).start(puerto);
        } catch (Throwable e) {
            mostrarErrorFatal("No se pudo iniciar el servidor en el puerto " + puerto + ": "
                    + descripcionError(e) + "\nEl detalle está en " + rutaLog().toString());
            System.exit(1);
            return;
        }

        // === Endpoints Fase 1 ===
        app.get("/api/status", ctx -> {
            boolean activo = dbService.verificarConexion();
            ctx.json(new StatusResponse(activo,
                    activo ? "Conectado" : "MySQL no está activo",
                    dbService.getBaseActiva()));
        });

        // === Endpoints Fase 2: Ejecución SQL ===

        // Ejecutar consulta(s) SQL
        app.post("/api/query", ctx -> {
            String sql = ctx.body();
            if (sql == null || sql.trim().isEmpty()) {
                ctx.status(400).json(new ErrorResponse("No se recibió SQL"));
                return;
            }
            var resultados = queryService.ejecutarMultiples(sql);

            // Agregar al historial si no hay errores
            boolean hayErrores = resultados.stream().anyMatch(r -> r.error);
            if (!hayErrores) {
                historialService.agregarAlHistorial(sql);
            }

            ctx.json(resultados);
        });

        // Listar bases de datos
        app.get("/api/databases", ctx -> {
            try {
                ctx.json(queryService.obtenerBasesDeDatos());
            } catch (SQLException e) {
                ctx.status(500).json(new ErrorResponse("No se pudieron listar las bases de datos: "
                        + e.getMessage()));
            }
        });

        // Listar tablas de una base de datos
        app.get("/api/tables", ctx -> {
            String baseDatos = ctx.queryParam("database");
            if (baseDatos == null || baseDatos.isEmpty()) {
                ctx.status(400).json(new ErrorResponse("Parámetro 'database' requerido"));
                return;
            }
            try {
                ctx.json(Map.of("tablas", queryService.obtenerTablas(baseDatos), "error", ""));
            } catch (SQLException e) {
                // Se devuelve el error para que la interfaz lo muestre: nunca fallar en silencio
                ctx.json(Map.of("tablas", List.of(), "error",
                        "No se pudieron listar las tablas: " + e.getMessage()));
            }
        });

        // Obtener columnas de una tabla
        app.get("/api/columns", ctx -> {
            String baseDatos = ctx.queryParam("database");
            String tabla = ctx.queryParam("table");
            if (baseDatos == null || tabla == null) {
                ctx.status(400).json(new ErrorResponse("Parámetros 'database' y 'table' requeridos"));
                return;
            }
            try {
                ctx.json(Map.of("columnas", queryService.obtenerColumnas(baseDatos, tabla), "error", ""));
            } catch (SQLException e) {
                ctx.json(Map.of("columnas", List.of(), "error",
                        "No se pudieron leer las columnas: " + e.getMessage()));
            }
        });

        // === Endpoints Fase 4: Consignas ===

        // Obtener todos los conjuntos y el activo
        app.get("/api/consignas/conjuntos", ctx -> {
            ctx.json(Map.of(
                "conjuntos", consignasService.obtenerConjuntos(),
                "activo", consignasService.obtenerConjuntoActivo()
            ));
        });

        // Obtener consignas del conjunto activo
        app.get("/api/consignas", ctx -> {
            var conjunto = consignasService.obtenerConjuntoActivo();
            var progreso = consignasService.obtenerProgreso();
            ctx.json(Map.of(
                "conjunto", conjunto,
                "progreso", progreso
            ));
        });

        // Crear nuevo conjunto
        app.post("/api/consignas/conjuntos", ctx -> {
            com.google.gson.JsonObject body = com.google.gson.JsonParser.parseString(ctx.body()).getAsJsonObject();
            String nombre = body.has("nombre") ? body.get("nombre").getAsString() : null;
            if (nombre == null || nombre.trim().isEmpty()) {
                ctx.status(400).json(new ErrorResponse("Nombre requerido"));
                return;
            }
            var conjunto = consignasService.crearConjunto(nombre.trim());
            ctx.json(conjunto);
        });

        // Activar conjunto
        app.put("/api/consignas/conjuntos/{id}/activar", ctx -> {
            String id = ctx.pathParam("id");
            consignasService.activarConjunto(id);
            ctx.json(Map.of("ok", true));
        });

        // Renombrar conjunto
        app.put("/api/consignas/conjuntos/{id}", ctx -> {
            String id = ctx.pathParam("id");
            com.google.gson.JsonObject body = com.google.gson.JsonParser.parseString(ctx.body()).getAsJsonObject();
            String nombre = body.has("nombre") ? body.get("nombre").getAsString() : null;
            if (nombre == null || nombre.trim().isEmpty()) {
                ctx.status(400).json(new ErrorResponse("Nombre requerido"));
                return;
            }
            consignasService.renombrarConjunto(id, nombre.trim());
            ctx.json(Map.of("ok", true));
        });

        // Eliminar conjunto
        app.delete("/api/consignas/conjuntos/{id}", ctx -> {
            String id = ctx.pathParam("id");
            consignasService.eliminarConjunto(id);
            ctx.json(Map.of("ok", true));
        });

        // Agregar consigna
        app.post("/api/consignas", ctx -> {
            com.google.gson.JsonObject body = com.google.gson.JsonParser.parseString(ctx.body()).getAsJsonObject();
            String texto = body.has("texto") ? body.get("texto").getAsString() : null;
            if (texto == null || texto.trim().isEmpty()) {
                ctx.status(400).json(new ErrorResponse("Texto requerido"));
                return;
            }
            var consigna = consignasService.agregarConsigna(texto.trim());
            ctx.json(consigna);
        });

        // Agregar múltiples consignas desde texto
        app.post("/api/consignas/lote", ctx -> {
            com.google.gson.JsonObject body = com.google.gson.JsonParser.parseString(ctx.body()).getAsJsonObject();
            String texto = body.has("texto") ? body.get("texto").getAsString() : null;
            if (texto == null || texto.trim().isEmpty()) {
                ctx.status(400).json(new ErrorResponse("Texto requerido"));
                return;
            }
            var nuevas = consignasService.agregarConsignasDesdeTexto(texto);
            ctx.json(nuevas);
        });

        // Editar consigna
        app.put("/api/consignas/{id}", ctx -> {
            String id = ctx.pathParam("id");
            com.google.gson.JsonObject body = com.google.gson.JsonParser.parseString(ctx.body()).getAsJsonObject();
            String texto = body.has("texto") ? body.get("texto").getAsString() : null;
            if (texto == null || texto.trim().isEmpty()) {
                ctx.status(400).json(new ErrorResponse("Texto requerido"));
                return;
            }
            consignasService.editarConsigna(id, texto.trim());
            ctx.json(Map.of("ok", true));
        });

        // Eliminar consigna
        app.delete("/api/consignas/{id}", ctx -> {
            String id = ctx.pathParam("id");
            consignasService.eliminarConsigna(id);
            ctx.json(Map.of("ok", true));
        });

        // Toggle consigna (marcar/desmarcar)
        app.put("/api/consignas/{id}/toggle", ctx -> {
            String id = ctx.pathParam("id");
            consignasService.toggleConsigna(id);
            ctx.json(Map.of("ok", true));
        });

        // Desmarcar todas
        app.post("/api/consignas/desmarcar-todas", ctx -> {
            consignasService.desmarcarTodas();
            ctx.json(Map.of("ok", true));
        });

        // Reordenar consigna
        app.put("/api/consignas/{id}/reordenar", ctx -> {
            String id = ctx.pathParam("id");
            com.google.gson.JsonObject body = com.google.gson.JsonParser.parseString(ctx.body()).getAsJsonObject();
            Integer direccion = body.has("direccion") ? body.get("direccion").getAsInt() : null;
            if (direccion == null) {
                ctx.status(400).json(new ErrorResponse("Dirección requerida"));
                return;
            }
            consignasService.reordenarConsigna(id, direccion);
            ctx.json(Map.of("ok", true));
        });

        // Exportar conjunto
        app.get("/api/consignas/conjuntos/{id}/exportar", ctx -> {
            String id = ctx.pathParam("id");
            String json = consignasService.exportarConjunto(id);
            if (json == null) {
                ctx.status(404).json(new ErrorResponse("Conjunto no encontrado"));
                return;
            }
            ctx.json(Map.of("json", json));
        });

        // Importar conjunto
        app.post("/api/consignas/importar", ctx -> {
            com.google.gson.JsonObject body = com.google.gson.JsonParser.parseString(ctx.body()).getAsJsonObject();
            String json = body.has("json") ? body.get("json").getAsString() : null;
            if (json == null || json.trim().isEmpty()) {
                ctx.status(400).json(new ErrorResponse("JSON requerido"));
                return;
            }
            var conjunto = consignasService.importarConjunto(json);
            if (conjunto == null) {
                ctx.status(400).json(new ErrorResponse("JSON inválido"));
                return;
            }
            ctx.json(conjunto);
        });

        // === Endpoints Fase 5: Historial, Favoritos y Pestañas ===

        // Obtener historial
        app.get("/api/historial", ctx -> {
            ctx.json(historialService.obtenerHistorial());
        });

        // Eliminar entrada del historial
        app.delete("/api/historial/{id}", ctx -> {
            String id = ctx.pathParam("id");
            historialService.eliminarDelHistorial(id);
            ctx.json(Map.of("ok", true));
        });

        // Limpiar historial
        app.delete("/api/historial", ctx -> {
            historialService.limpiarHistorial();
            ctx.json(Map.of("ok", true));
        });

        // Marcar como favorito desde el historial
        app.post("/api/historial/{id}/favorito", ctx -> {
            String id = ctx.pathParam("id");
            var fav = historialService.marcarComoFavorito(id);
            if (fav == null) {
                ctx.status(404).json(new ErrorResponse("Entrada no encontrada"));
                return;
            }
            ctx.json(fav);
        });

        // Obtener favoritos
        app.get("/api/favoritos", ctx -> {
            ctx.json(historialService.obtenerFavoritos());
        });

        // Agregar a favoritos
        app.post("/api/favoritos", ctx -> {
            com.google.gson.JsonObject body = com.google.gson.JsonParser.parseString(ctx.body()).getAsJsonObject();
            String sql = body.has("sql") ? body.get("sql").getAsString() : null;
            String nombre = body.has("nombre") ? body.get("nombre").getAsString() : null;
            if (sql == null || sql.trim().isEmpty()) {
                ctx.status(400).json(new ErrorResponse("SQL requerido"));
                return;
            }
            var fav = historialService.agregarAFavoritos(sql, nombre);
            ctx.json(fav);
        });

        // Eliminar favorito
        app.delete("/api/favoritos/{id}", ctx -> {
            String id = ctx.pathParam("id");
            historialService.eliminarDeFavoritos(id);
            ctx.json(Map.of("ok", true));
        });

        // Obtener pestañas
        app.get("/api/pestanas", ctx -> {
            ctx.json(pestanasService.obtenerPestanas());
        });

        // Guardar pestañas (todas)
        app.post("/api/pestanas", ctx -> {
            com.google.gson.JsonArray body = com.google.gson.JsonParser.parseString(ctx.body()).getAsJsonArray();
            // Limpiar pestañas existentes y guardar las nuevas
            for (var pestana : body) {
                var obj = pestana.getAsJsonObject();
                String nombre = obj.has("nombre") ? obj.get("nombre").getAsString() : "Sin nombre";
                String contenido = obj.has("contenido") ? obj.get("contenido").getAsString() : "";
                pestanasService.agregarPestana(nombre, contenido);
            }
            ctx.json(Map.of("ok", true));
        });

        // Eliminar pestaña
        app.delete("/api/pestanas/{id}", ctx -> {
            String id = ctx.pathParam("id");
            pestanasService.eliminarPestana(id);
            ctx.json(Map.of("ok", true));
        });

        // Obtener preferencias
        app.get("/api/preferencias", ctx -> {
            ctx.json(pestanasService.obtenerPreferencias());
        });

        // Actualizar preferencias
        app.put("/api/preferencias", ctx -> {
            com.google.gson.JsonObject body = com.google.gson.JsonParser.parseString(ctx.body()).getAsJsonObject();
            if (body.has("tema")) {
                pestanasService.actualizarTema(body.get("tema").getAsString());
            }
            if (body.has("ultimaBase")) {
                pestanasService.actualizarUltimaBase(body.get("ultimaBase").getAsString());
            }
            if (body.has("layout") && body.get("layout").isJsonObject()) {
                pestanasService.actualizarLayout(new com.google.gson.Gson().fromJson(
                        body.getAsJsonObject("layout"),
                        new com.google.gson.reflect.TypeToken<Map<String, Object>>() {}.getType()));
            }
            ctx.json(pestanasService.obtenerPreferencias());
        });

        // === Base de datos activa ===

        // Al arrancar, se retoma la base que se estaba usando
        dbService.setBaseActiva(pestanasService.obtenerPreferencias().ultimaBase);

        // Cambiar la base de datos activa (desplegable del header o clic en EXPLORADOR)
        app.post("/api/base-activa", ctx -> {
            com.google.gson.JsonObject body = com.google.gson.JsonParser.parseString(ctx.body()).getAsJsonObject();
            String base = body.has("base") ? body.get("base").getAsString() : "";
            dbService.setBaseActiva(base);
            pestanasService.actualizarUltimaBase(dbService.getBaseActiva() == null ? "" : dbService.getBaseActiva());
            ctx.json(Map.of("ok", true,
                    "base", dbService.getBaseActiva() == null ? "" : dbService.getBaseActiva()));
        });

        // Abrir navegador automáticamente
        abrirNavegador(puerto);

        System.out.println("SQL Alumnos iniciado en http://127.0.0.1:" + puerto);
    }

    /**
     * Devuelve la ruta del archivo de log (logs/app.log junto al programa).
     */
    private static Path rutaLog() {
        return RutasApp.carpeta("logs").resolve("app.log");
    }

    /**
     * Redirige toda la salida (System.out, System.err y SLF4J) al archivo
     * logs/app.log, porque el ejecutable se abre sin ventana de consola.
     * Si el archivo supera 2 MB, se rota a app.log.1.
     */
    private static void configurarLogs() {
        try {
            Path carpetaLogs = RutasApp.carpeta("logs");
            Files.createDirectories(carpetaLogs);
            Path archivoLog = carpetaLogs.resolve("app.log");

            rotarLogSiGrande(archivoLog);

            PrintStream salida = new PrintStream(
                    Files.newOutputStream(archivoLog, StandardOpenOption.CREATE, StandardOpenOption.APPEND),
                    true, StandardCharsets.UTF_8);
            System.setOut(salida);
            System.setErr(salida);

            // SLF4J simple escribe en el archivo indicado por esta propiedad
            System.setProperty("org.slf4j.simpleLogger.logFile", archivoLog.toString());
            System.setProperty("org.slf4j.simpleLogger.defaultLogLevel", "info");
        } catch (IOException e) {
            // Si no se puede crear logs/, se sigue con la salida por defecto
        }
    }

    /**
     * Rota el log si superó el tamaño máximo, dejando una sola copia.
     * @param archivoLog archivo de log actual
     */
    private static void rotarLogSiGrande(Path archivoLog) {
        try {
            if (Files.exists(archivoLog) && Files.size(archivoLog) > TAMANO_MAXIMO_LOG) {
                Files.deleteIfExists(archivoLog.resolveSibling("app.log.1"));
                Files.move(archivoLog, archivoLog.resolveSibling("app.log.1"),
                        StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            // Si no se puede rotar, se sigue escribiendo en el mismo archivo
        }
    }

    /**
     * Muestra un mensaje de error al usuario cuando el programa no puede arrancar.
     * Como no hay consola, se usa un diálogo; además queda registrado en el log.
     * @param mensaje texto a mostrar
     */
    private static void mostrarErrorFatal(String mensaje) {
        System.err.println(mensaje);
        try {
            JOptionPane.showMessageDialog(null, mensaje,
                    "SQL Alumnos - no se pudo iniciar", JOptionPane.ERROR_MESSAGE);
        } catch (Throwable t) {
            // Si no hay interfaz gráfica disponible, el mensaje queda solo en el log
        }
    }

    /**
     * Describe un error de forma legible para el usuario (sin stack trace).
     * @param e excepción producida
     * @return descripción corta del error
     */
    private static String descripcionError(Throwable e) {
        String mensaje = e.getMessage();
        return (mensaje != null && !mensaje.isBlank()) ? mensaje : e.getClass().getSimpleName();
    }

    /**
     * Busca un puerto libre entre PUERTO_INICIAL y PUERTO_MAXIMO.
     * @return número de puerto disponible, o -1 si ninguno está libre
     */
    private static int encontrarPuertoLibre() {
        for (int puerto = PUERTO_INICIAL; puerto <= PUERTO_MAXIMO; puerto++) {
            try (ServerSocket socket = new ServerSocket(puerto)) {
                return puerto;
            } catch (IOException e) {
                // Puerto ocupado, probar el siguiente
            }
        }
        return -1;
    }

    /**
     * Abre el navegador predeterminado con la URL del servidor.
     * @param puerto puerto donde escucha el servidor
     */
    private static void abrirNavegador(int puerto) {
        new Thread(() -> {
            try {
                TimeUnit.MILLISECONDS.sleep(500);
                String url = "http://127.0.0.1:" + puerto;
                if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                    Desktop.getDesktop().browse(URI.create(url));
                } else {
                    Runtime.getRuntime().exec("rundll32 url.dll,FileProtocolHandler " + url);
                }
            } catch (Exception e) {
                System.err.println("No se pudo abrir el navegador automáticamente: " + e.getMessage());
            }
        }).start();
    }

    public static class StatusResponse {
        public boolean activo;
        public String mensaje;
        /** Base de datos activa (la elegida en el desplegable). */
        public String base;

        public StatusResponse(boolean activo, String mensaje, String base) {
            this.activo = activo;
            this.mensaje = mensaje;
            this.base = base == null ? "" : base;
        }
    }

    public static class ErrorResponse {
        public String error;

        public ErrorResponse(String error) {
            this.error = error;
        }
    }
}
