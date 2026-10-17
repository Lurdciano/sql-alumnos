package com.sqlplayground;

import java.sql.*;
import java.util.*;

/**
 * Servicio de ejecución de consultas SQL.
 * Ejecuta sentencias y devuelve resultados estructurados.
 */
public class QueryService {

    private static final int LIMITE_FILAS = 1000;
    private final DatabaseService dbService;

    public QueryService(DatabaseService dbService) {
        this.dbService = dbService;
    }

    /**
     * Ejecuta múltiples sentencias SQL y devuelve los resultados.
     * @param sql texto SQL con una o más sentencias separadas por ;
     * @return lista de resultados por sentencia
     */
    public List<QueryResult> ejecutarMultiples(String sql) {
        List<String> sentencias = SqlParser.dividirSentencias(sql);
        List<QueryResult> resultados = new ArrayList<>();

        try (Connection conn = dbService.obtenerConexion()) {
            for (String sentencia : sentencias) {
                QueryResult resultado = ejecutarSentencia(conn, sentencia);
                resultados.add(resultado);
            }
        } catch (SQLException e) {
            // Si falla la conexión, devolver error
            QueryResult error = new QueryResult();
            error.error = true;
            error.mensajeError = "Error de conexión: " + e.getMessage();
            resultados.add(error);
        }

        return resultados;
    }

    /**
     * Ejecuta una única sentencia SQL.
     */
    private QueryResult ejecutarSentencia(Connection conn, String sql) throws SQLException {
        QueryResult resultado = new QueryResult();
        resultado.sql = sql;

        long inicio = System.currentTimeMillis();

        try (Statement stmt = conn.createStatement()) {
            boolean esResultSet = stmt.execute(sql);

            if (esResultSet) {
                // SELECT, SHOW, DESCRIBE, etc.
                try (ResultSet rs = stmt.getResultSet()) {
                    ResultSetMetaData meta = rs.getMetaData();
                    int numColumnas = meta.getColumnCount();

                    // Leer encabezados
                    List<String> columnas = new ArrayList<>();
                    for (int i = 1; i <= numColumnas; i++) {
                        columnas.add(meta.getColumnLabel(i));
                    }
                    resultado.columnas = columnas;

                    // Leer filas
                    List<List<String>> filas = new ArrayList<>();
                    int contador = 0;
                    boolean truncado = false;

                    while (rs.next()) {
                        if (contador >= LIMITE_FILAS) {
                            truncado = true;
                            break;
                        }
                        List<String> fila = new ArrayList<>();
                        for (int i = 1; i <= numColumnas; i++) {
                            Object valor = rs.getObject(i);
                            fila.add(valor != null ? valor.toString() : null);
                        }
                        filas.add(fila);
                        contador++;
                    }

                    resultado.filas = filas;
                    resultado.totalFilas = contador;
                    resultado.truncado = truncado;
                }
            } else {
                // INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, USE, etc.
                int filasAfectadas = stmt.getUpdateCount();
                resultado.filasAfectadas = filasAfectadas;
            }
        } catch (SQLException e) {
            resultado.error = true;
            resultado.mensajeError = e.getMessage();
            resultado.codigoError = e.getErrorCode();
            resultado.sqlEstado = e.getSQLState();
        }

        long fin = System.currentTimeMillis();
        resultado.tiempoEjecucion = fin - inicio;

        return resultado;
    }

    /**
     * Obtiene la lista de bases de datos disponibles.
     * @throws SQLException si no se puede conectar o no hay permisos
     */
    public List<String> obtenerBasesDeDatos() throws SQLException {
        List<String> bases = new ArrayList<>();
        try (Connection conn = dbService.obtenerConexion();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SHOW DATABASES")) {
            while (rs.next()) {
                bases.add(rs.getString(1));
            }
        }
        return bases;
    }

    /**
     * Obtiene las tablas de una base de datos.
     * Se consulta information_schema con parámetro, así los nombres con
     * guiones, mayúsculas o acentos se tratan correctamente (sin concatenar
     * el nombre en la sentencia).
     * @param baseDatos nombre de la base
     * @return lista de nombres de tablas
     * @throws SQLException si la consulta falla
     */
    public List<String> obtenerTablas(String baseDatos) throws SQLException {
        List<String> tablas = new ArrayList<>();
        String sql = "SELECT TABLE_NAME FROM information_schema.TABLES "
                + "WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME";
        try (Connection conn = dbService.obtenerConexion();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, baseDatos);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    tablas.add(rs.getString(1));
                }
            }
        }
        return tablas;
    }

    /**
     * Obtiene las columnas de una tabla.
     * @param baseDatos nombre de la base
     * @param tabla nombre de la tabla
     * @return lista de columnas con su tipo
     * @throws SQLException si la consulta falla
     */
    public List<ColumnaInfo> obtenerColumnas(String baseDatos, String tabla) throws SQLException {
        List<ColumnaInfo> columnas = new ArrayList<>();
        String sql = "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA "
                + "FROM information_schema.COLUMNS "
                + "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION";
        try (Connection conn = dbService.obtenerConexion();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, baseDatos);
            ps.setString(2, tabla);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    ColumnaInfo col = new ColumnaInfo();
                    col.nombre = rs.getString("COLUMN_NAME");
                    col.tipo = rs.getString("COLUMN_TYPE");
                    col.nulo = "YES".equals(rs.getString("IS_NULLABLE"));
                    col.clave = rs.getString("COLUMN_KEY");
                    col.valorPorDefecto = rs.getString("COLUMN_DEFAULT");
                    col.extra = rs.getString("EXTRA");
                    columnas.add(col);
                }
            }
        }
        return columnas;
    }

    /**
     * Clase interna para información de columna.
     */
    public static class ColumnaInfo {
        public String nombre;
        public String tipo;
        public boolean nulo;
        public String clave;
        public String valorPorDefecto;
        public String extra;
    }

    /**
     * Resultado de una consulta SQL.
     */
    public static class QueryResult {
        public String sql;
        public List<String> columnas;
        public List<List<String>> filas;
        public int totalFilas;
        public boolean truncado;
        public int filasAfectadas = -1;
        public long tiempoEjecucion;
        public boolean error;
        public String mensajeError;
        public int codigoError;
        public String sqlEstado;
    }
}
