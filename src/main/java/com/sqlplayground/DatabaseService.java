package com.sqlplayground;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Servicio de conexión a la base de datos MariaDB/MySQL.
 * Gestiona la conexión, la base de datos activa y verifica si MySQL está activo.
 */
public class DatabaseService {

    private final ConfigService config;

    /** Base de datos seleccionada en la interfaz (la que se usa por defecto). */
    private volatile String baseActiva;

    public DatabaseService(ConfigService config) {
        this.config = config;
    }

    /**
     * Verifica si MySQL/MariaDB está activo intentando una conexión.
     * @return true si la conexión es exitosa, false en caso contrario
     */
    public boolean verificarConexion() {
        try (Connection conn = obtenerConexion()) {
            return conn != null && conn.isValid(2);
        } catch (SQLException e) {
            return false;
        }
    }

    /**
     * Devuelve la base de datos activa (la elegida en el desplegable).
     * @return nombre de la base, o null si no hay ninguna
     */
    public String getBaseActiva() {
        return baseActiva;
    }

    /**
     * Define la base de datos activa. Se usa en las conexiones siguientes,
     * de modo que las consultas se ejecuten sobre esa base sin escribir USE.
     * @param base nombre de la base; null o vacío para trabajar sin base por defecto
     */
    public void setBaseActiva(String base) {
        this.baseActiva = normalizarBase(base);
    }

    /**
     * Limpia el nombre de la base (espacios y comillas sueltas).
     * @param base nombre recibido
     * @return nombre limpio, o null si no corresponde
     */
    private String normalizarBase(String base) {
        if (base == null) {
            return null;
        }
        String limpio = base.trim();
        while (limpio.startsWith("`") && limpio.endsWith("`") && limpio.length() >= 2) {
            limpio = limpio.substring(1, limpio.length() - 1).trim();
        }
        return limpio.isEmpty() ? null : limpio;
    }

    /**
     * Obtiene una conexión a la base de datos, ya situada en la base activa.
     * @return Connection activa
     * @throws SQLException si no se puede conectar
     */
    public Connection obtenerConexion() throws SQLException {
        String url = String.format("jdbc:mariadb://%s:%d/", config.getHost(), config.getPuertoDb());
        Connection conn = DriverManager.getConnection(url, config.getUsuario(), config.getPassword());
        seleccionarBaseEnConexion(conn);
        return conn;
    }

    /**
     * Ejecuta USE sobre la conexión para que las consultas corran sobre la base activa.
     * Si la base no existe o no se puede seleccionar, se sigue con la conexión
     * al servidor: la consulta del usuario mostrará el error correspondiente.
     * @param conn conexión abierta
     */
    private void seleccionarBaseEnConexion(Connection conn) {
        String base = baseActiva;
        if (base == null) {
            return;
        }
        try (Statement stmt = conn.createStatement()) {
            stmt.execute("USE `" + base.replace("`", "``") + "`");
        } catch (SQLException e) {
            // La base no existe o no se puede usar: se olvida para no reintentar siempre
            System.err.println("No se pudo usar la base '" + base + "': " + e.getMessage());
            this.baseActiva = null;
        }
    }
}
