package com.sqlplayground;

import java.util.ArrayList;
import java.util.List;

/**
 * Parser de sentencias SQL.
 * Divide un texto con múltiples sentencias separadas por ; respetando:
 * - Cadenas con comillas simples y dobles
 * - Comentarios de línea (-- y #) y de bloque (/* *\/)
 * - DELIMITER personalizado
 */
public class SqlParser {

    /**
     * Divide el texto SQL en sentencias individuales.
     * @param sql texto SQL con una o más sentencias
     * @return lista de sentencias SQL limpias
     */
    public static List<String> dividirSentencias(String sql) {
        List<String> sentencias = new ArrayList<>();
        if (sql == null || sql.trim().isEmpty()) {
            return sentencias;
        }

        StringBuilder sentenciaActual = new StringBuilder();
        int i = 0;
        int longitud = sql.length();

        // Manejo de DELIMITER personalizado
        String delimiter = ";";

        while (i < longitud) {
            // Verificar si hay un cambio de DELIMITER
            if (sql.substring(i).toUpperCase().startsWith("DELIMITER ")) {
                int finLinea = sql.indexOf('\n', i);
                if (finLinea == -1) finLinea = longitud;
                delimiter = sql.substring(i + 10, finLinea).trim();
                i = finLinea + 1;
                continue;
            }

            char c = sql.charAt(i);

            // Comentario de línea --
            if (c == '-' && i + 1 < longitud && sql.charAt(i + 1) == '-') {
                int finLinea = sql.indexOf('\n', i);
                if (finLinea == -1) finLinea = longitud;
                i = finLinea + 1;
                continue;
            }

            // Comentario de línea #
            if (c == '#') {
                int finLinea = sql.indexOf('\n', i);
                if (finLinea == -1) finLinea = longitud;
                i = finLinea + 1;
                continue;
            }

            // Comentario de bloque /* */
            if (c == '/' && i + 1 < longitud && sql.charAt(i + 1) == '*') {
                int finComentario = sql.indexOf("*/", i + 2);
                if (finComentario == -1) finComentario = longitud;
                i = finComentario + 2;
                continue;
            }

            // Cadena con comillas simples
            if (c == '\'') {
                sentenciaActual.append(c);
                i++;
                while (i < longitud) {
                    char cc = sql.charAt(i);
                    sentenciaActual.append(cc);
                    i++;
                    if (cc == '\'') {
                        // Verificar si es escape ('')
                        if (i < longitud && sql.charAt(i) == '\'') {
                            sentenciaActual.append('\'');
                            i++;
                        } else {
                            break;
                        }
                    }
                }
                continue;
            }

            // Cadena con comillas dobles
            if (c == '"') {
                sentenciaActual.append(c);
                i++;
                while (i < longitud) {
                    char cc = sql.charAt(i);
                    sentenciaActual.append(cc);
                    i++;
                    if (cc == '"') {
                        // Verificar si es escape ("")
                        if (i < longitud && sql.charAt(i) == '"') {
                            sentenciaActual.append('"');
                            i++;
                        } else {
                            break;
                        }
                    }
                }
                continue;
            }

            // Backtick (identificadores)
            if (c == '`') {
                sentenciaActual.append(c);
                i++;
                while (i < longitud) {
                    char cc = sql.charAt(i);
                    sentenciaActual.append(cc);
                    i++;
                    if (cc == '`') break;
                }
                continue;
            }

            // Verificar delimitador
            if (sql.substring(i).startsWith(delimiter)) {
                String sent = sentenciaActual.toString().trim();
                if (!sent.isEmpty()) {
                    sentencias.add(sent);
                }
                sentenciaActual = new StringBuilder();
                i += delimiter.length();
                continue;
            }

            sentenciaActual.append(c);
            i++;
        }

        // Agregar la última sentencia si no termina con delimitador
        String ultima = sentenciaActual.toString().trim();
        if (!ultima.isEmpty()) {
            sentencias.add(ultima);
        }

        return sentencias;
    }
}
