/**
 * SQL Alumnos - Frontend principal
 * Fase 3: Editor con resaltado, explorador de bases, grilla de resultados
 */

// Bases de datos del sistema: se muestran atenuadas en el explorador
const BASES_SISTEMA = ['information_schema', 'mysql', 'performance_schema', 'sys'];

// Tamaño mínimo de los paneles, para que siempre se puedan usar
const MIN_PANEL_ALTO = 90;
// Las consignas necesitan más lugar: sin esto la lista quedaría sin espacio visible
const MIN_CONSIGNAS_ALTO = 190;
const MIN_SIDEBAR_ANCHO = 200;
const MIN_HISTORIAL_ANCHO = 220;

// Sentencias que cambian la estructura de las bases (obligan a refrescar el explorador)
const RE_SENTENCIA_DDL = /^\s*(CREATE|ALTER|DROP|RENAME|TRUNCATE)\b/i;

// Sentencias que cambian cuál es la base activa
const RE_USO_BASE = /^\s*USE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([^`;\s]+)`?/i;
const RE_CREAR_BASE = /^\s*CREATE\s+DATABASE(?:\s+IF\s+NOT\s+EXISTS)?\s+`?([^`;\s]+)`?/i;
const RE_BORRAR_BASE = /^\s*DROP\s+DATABASE(?:\s+IF\s+EXISTS)?\s+`?([^`;\s]+)`?/i;

// ===== Estado global =====
const estado = {
    pestañas: [],
    pestañaActiva: null,
    baseDatosActiva: null,
    tema: 'dark',
    editor: null,

    // Explorador: el estado de expansión vive acá, no en el DOM,
    // para que el polling de conexión no pueda plegar lo que el usuario abrió.
    bases: [],
    basesExpandidas: new Set(),
    tablasExpandidas: new Set(),   // clave: "base\u0000tabla"
    contenedoresTablas: new Map(), // base -> elemento <div> donde van sus tablas
    tablasCache: {},                // base -> { tablas: [], error: '' }
    columnasCache: {},             // "base\u0000tabla" -> { columnas: [], error: '' }
    conexionActiva: null,          // último estado conocido de MySQL

    // Layout de los paneles
    layout: {
        sidebarWidth: 300,
        exploradorAlto: 300,
        consignasAlto: 300,
        exploradorAbierto: true,
        consignasAbierto: true,
        historialAbierto: true,
        historialWidth: 320,
        editorAlto: 300
    }
};

// Temporizador para no guardar preferencias en cada movimiento
let temporizadorGuardar = null;

// ===== Inicialización =====
document.addEventListener('DOMContentLoaded', () => {
    inicializarEditor();
    inicializarEventos();
    inicializarLayout();
    inicializarConsignas();
    inicializarHistorial();
    cargarTema();
    cargarPreferencias();
    verificarConexion();
    cargarBasesDeDatos();
    crearPestaña('Nueva consulta');

    // Verificar conexión cada 5 segundos
    setInterval(verificarConexion, 5000);

    // Ajustar paneles si cambia el tamaño de la ventana
    window.addEventListener('resize', ajustarLayoutAVentana);
});

// ===== CodeMirror =====
function inicializarEditor() {
    estado.editor = CodeMirror.fromTextArea(document.getElementById('sql-editor'), {
        mode: 'text/x-mysql',
        theme: 'material-darker',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        lineWrapping: true,
        extraKeys: {
            'Ctrl-Enter': ejecutarConsulta,
            'F9': ejecutarConsulta,
            'Ctrl-Space': 'autocomplete'
        },
        hintOptions: {
            tables: {},
            completeSingle: false
        }
    });

    // Actualizar tablas para autocompletado cuando cambie la base
    estado.editor.on('keyup', (cm, event) => {
        // Autocompletado manual con Ctrl+Space
        if (event.ctrlKey && event.code === 'Space') {
            CodeMirror.commands.autocomplete(cm);
        }
    });
}

// ===== Eventos =====
function inicializarEventos() {
    // Botón ejecutar
    document.getElementById('btn-execute').addEventListener('click', ejecutarConsulta);

    // Botón limpiar
    document.getElementById('btn-clear').addEventListener('click', () => {
        estado.editor.setValue('');
        estado.editor.focus();
    });

    // Botón nueva pestaña
    document.getElementById('btn-new-tab').addEventListener('click', () => {
        crearPestaña('Nueva consulta');
    });

    // Botón recargar explorador
    document.getElementById('btn-reload-explorer').addEventListener('click', () => {
        estado.tablasCache = {};
        estado.columnasCache = {};
        cargarBasesDeDatos();
    });

    // Botón tema
    document.getElementById('btn-theme').addEventListener('click', alternarTema);

    // Botón cerrar
    document.getElementById('btn-close').addEventListener('click', async () => {
        const cerrar = await pedirConfirmacion({
            titulo: 'Cerrar SQL Alumnos',
            mensaje: '¿Querés cerrar el programa?',
            aceptar: 'Cerrar',
            cancelar: 'Seguir usando'
        });
        if (!cerrar) return;
        window.close();
        // Fallback si no se puede cerrar la ventana
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1e1e1e;color:#d4d4d4;font-family:sans-serif;"><h1>SQL Alumnos cerrado</h1></div>';
    });

    // Botón para mostrar u ocultar los paneles laterales
    document.getElementById('btn-paneles').addEventListener('click', alternarSidebar);

    // Botones de los bordes para volver a mostrar los paneles ocultos
    document.getElementById('btn-mostrar-sidebar').addEventListener('click', alternarSidebar);
    document.getElementById('btn-mostrar-historial').addEventListener('click', () => {
        alternarPanel('panel-historial');
    });

    // Selector de base de datos: deja esa base como base de trabajo
    document.getElementById('db-selector').addEventListener('change', (e) => {
        seleccionarBase(e.target.value);
    });

    // Atajos de teclado para ocultar o mostrar los paneles
    document.addEventListener('keydown', (e) => {
        if (modalAbierto()) return;

        if (e.key === 'F8') {
            e.preventDefault();
            alternarPanel('panel-explorer');
        } else if (e.key === 'F7') {
            e.preventDefault();
            alternarPanel('panel-consignas');
        } else if (e.key === 'F10') {
            e.preventDefault();
            alternarPanel('panel-historial');
        }
    });
}

// ===== Layout: paneles plegables y divisores redimensionables =====
function inicializarLayout() {
    // Plegar o desplegar un panel al hacer clic en su encabezado o en su botón
    document.querySelectorAll('[data-panel-toggle]').forEach(header => {
        header.addEventListener('click', (e) => {
            // Los botones que no son de plegar no cambian el panel
            if (e.target.closest('button:not(.panel-toggle)') || e.target.closest('select')) return;
            alternarPanel(header.dataset.panelToggle);
        });
    });

    // Divisores redimensionables
    iniciarRedimension('resizer-sidebar', 'row', aplicarLayout);
    iniciarRedimension('resizer-sidebar-width', 'col', aplicarLayout);
    iniciarRedimension('resizer-editor', 'row', aplicarLayout);
    iniciarRedimension('resizer-historial', 'col', aplicarLayout);

    aplicarLayout();
}

/**
 * Muestra u oculta un panel.
 * @param {string} idPanel id del panel (panel-explorer, panel-consignas o panel-historial)
 */
function alternarPanel(idPanel) {
    const clave = idPanel === 'panel-explorer' ? 'exploradorAbierto'
        : (idPanel === 'panel-consignas' ? 'consignasAbierto' : 'historialAbierto');
    estado.layout[clave] = !estado.layout[clave];
    aplicarLayout();
    if (estado.editor) estado.editor.refresh();
    guardarPreferencias();
}

/**
 * Muestra u oculta toda la barra izquierda (explorador y consignas).
 */
function alternarSidebar() {
    const abierto = estado.layout.exploradorAbierto || estado.layout.consignasAbierto;
    estado.layout.exploradorAbierto = !abierto;
    estado.layout.consignasAbierto = !abierto;
    aplicarLayout();
    if (estado.editor) estado.editor.refresh();
    guardarPreferencias();
}

/**
 * Permite arrastrar un divisor para cambiar el tamaño de los paneles vecinos.
 * @param {string} idElemento id del divisor
 * @param {string} orientacion 'row' (vertical) u 'col' (horizontal)
 * @param {Function} alSoltar callback que recalcula el layout
 */
function iniciarRedimension(idElemento, orientacion, alSoltar) {
    const resizer = document.getElementById(idElemento);
    if (!resizer) return;

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        resizer.classList.add('arrastrando');
        document.body.classList.add('redimensionando');

        const mover = (ev) => {
            if (orientacion === 'row') {
                redimensionarVertical(resizer, ev.clientY);
            } else {
                redimensionarHorizontal(resizer, ev.clientX);
            }
            aplicarLayout();
            // El editor tiene que recalcular su alto mientras se arrastra
            if (estado.editor) estado.editor.refresh();
        };

        const soltar = () => {
            resizer.classList.remove('arrastrando');
            document.body.classList.remove('redimensionando');
            document.removeEventListener('mousemove', mover);
            document.removeEventListener('mouseup', soltar);
            if (estado.editor) estado.editor.refresh();
            alSoltar();
            guardarPreferencias();
        };

        document.addEventListener('mousemove', mover);
        document.addEventListener('mouseup', soltar);
    });
}

/**
 * Calcula la nueva altura de los paneles que están uno encima del otro.
 * @param {HTMLElement} resizer divisor arrastrado
 * @param {number} clientY posición vertical del mouse
 */
function redimensionarVertical(resizer, clientY) {
    const arriba = resizer.previousElementSibling;
    const abajo = resizer.nextElementSibling;
    if (!arriba || !abajo) return;

    const rectArriba = arriba.getBoundingClientRect();
    // El panel de consignas necesita un mínimo mayor para que su lista se vea
    const minAbajo = abajo.id === 'panel-consignas' ? MIN_CONSIGNAS_ALTO : MIN_PANEL_ALTO;
    const altoArriba = Math.max(MIN_PANEL_ALTO, clientY - rectArriba.top);
    const altoAbajo = Math.max(minAbajo, abajo.getBoundingClientRect().bottom - clientY);

    if (resizer.id === 'resizer-sidebar') {
        estado.layout.exploradorAlto = Math.round(altoArriba);
        estado.layout.consignasAlto = Math.round(altoAbajo);
    } else if (resizer.id === 'resizer-editor') {
        estado.layout.editorAlto = Math.round(altoArriba);
    }
}

/**
 * Calcula el nuevo ancho de los paneles que están uno al lado del otro.
 * @param {HTMLElement} resizer divisor arrastrado
 * @param {number} clientX posición horizontal del mouse
 */
function redimensionarHorizontal(resizer, clientX) {
    const ancho = window.innerWidth;
    const minimo = Math.min(MIN_SIDEBAR_ANCHO, 120);

    if (resizer.id === 'resizer-sidebar-width') {
        const sidebar = document.getElementById('sidebar');
        const nuevo = clientX - sidebar.getBoundingClientRect().left;
        estado.layout.sidebarWidth = limitar(nuevo, minimo, Math.max(minimo, ancho - 460));
    } else if (resizer.id === 'resizer-historial') {
        const panel = document.getElementById('panel-historial');
        const nuevo = panel.getBoundingClientRect().right - clientX;
        estado.layout.historialWidth = limitar(
            nuevo, MIN_HISTORIAL_ANCHO, Math.max(MIN_HISTORIAL_ANCHO, ancho - 520));
    }
}

/**
 * Fija la altura de un panel del sidebar.
 * @param {HTMLElement} panel panel a ajustar
 * @param {boolean} abierto true si el panel está desplegado
 * @param {number} altoGrow proporción de altura (px) cuando está abierto
 */
function fijarAlto(panel, abierto, altoGrow) {
    panel.classList.toggle('collapsed', !abierto);
    panel.style.flexGrow = abierto ? String(Math.max(altoGrow, 0)) : '0';
    panel.style.flexBasis = abierto ? '0' : 'auto';
    panel.style.flexShrink = abierto ? '1' : '0';
}

/**
 * Limita un valor entre un mínimo y un máximo.
 * @param {number} valor valor a limitar
 * @param {number} min mínimo
 * @param {number} max máximo
 * @returns {number} valor limitado
 */
function limitar(valor, min, max) {
    return Math.round(Math.min(Math.max(valor, min), max));
}

/**
 * Aplica los tamaños y el estado de plegado guardados en estado.layout.
 */
function aplicarLayout() {
    const L = estado.layout;

    const sidebar = document.getElementById('sidebar');
    const explorador = document.getElementById('panel-explorer');
    const consignas = document.getElementById('panel-consignas');
    const editorCont = document.getElementById('editor-container');
    const historial = document.getElementById('panel-historial');

    if (!sidebar || !explorador || !consignas || !editorCont || !historial) return;

    // Panel izquierdo: se limita el ancho para que el centro nunca quede sin espacio
    const anchoVentana = window.innerWidth;
    const ANCHO_CENTRO_MIN = 300;
    const anchoHistorial = L.historialAbierto ? L.historialWidth : 60;
    const anchoSidebar = limitar(L.sidebarWidth, MIN_SIDEBAR_ANCHO,
        Math.max(MIN_SIDEBAR_ANCHO, anchoVentana - anchoHistorial - ANCHO_CENTRO_MIN - 12));
    const anchoHistorialReal = limitar(anchoHistorial, MIN_HISTORIAL_ANCHO,
        Math.max(MIN_HISTORIAL_ANCHO, anchoVentana - anchoSidebar - ANCHO_CENTRO_MIN - 12));

    // Si las dos secciones están ocultas, la barra lateral desaparece por completo
    const sidebarAbierto = L.exploradorAbierto || L.consignasAbierto;
    sidebar.style.flex = sidebarAbierto ? `0 0 ${anchoSidebar}px` : '0 0 0px';
    document.getElementById('resizer-sidebar-width').classList.toggle('oculto', !sidebarAbierto);
    document.getElementById('resizer-sidebar').classList.toggle('oculto', !sidebarAbierto);
    document.getElementById('btn-mostrar-sidebar').classList.toggle('oculto', sidebarAbierto);

    // Explorador y Consignas: se reparten la altura real de la barra lateral,
    // respetando mínimos, para que la lista de consignas nunca quede sin espacio.
    const divisorSidebar = document.getElementById('resizer-sidebar');
    const altoSidebar = sidebar.getBoundingClientRect().height;
    const grosorDivisor = divisorSidebar ? divisorSidebar.getBoundingClientRect().height : 5;
    const disponible = Math.max(MIN_PANEL_ALTO * 2, altoSidebar - grosorDivisor);

    if (L.exploradorAbierto && L.consignasAbierto) {
        const altoExplorador = limitar(L.exploradorAlto, MIN_PANEL_ALTO,
            Math.max(MIN_PANEL_ALTO, disponible - MIN_CONSIGNAS_ALTO));
        fijarAlto(explorador, true, altoExplorador);
        fijarAlto(consignas, true, disponible - altoExplorador);
    } else if (L.exploradorAbierto) {
        fijarAlto(explorador, true, disponible);
        fijarAlto(consignas, false, 0);
    } else if (L.consignasAbierto) {
        fijarAlto(explorador, false, 0);
        fijarAlto(consignas, true, disponible);
    } else {
        fijarAlto(explorador, false, 0);
        fijarAlto(consignas, false, 0);
    }

    // Editor y resultados: se reparten la altura real del centro.
    // Ambos con base 0 para que la barra divisora los mueva de verdad.
    const contenedorCentro = editorCont.parentElement;
    const pestañas = document.getElementById('tabs-container');
    const divisorEditor = document.getElementById('resizer-editor');
    const resultadosCont = document.getElementById('results-container');
    const altoDisponible = Math.max(MIN_PANEL_ALTO * 2,
        contenedorCentro.getBoundingClientRect().height
        - (pestañas ? pestañas.getBoundingClientRect().height : 0)
        - (divisorEditor ? divisorEditor.getBoundingClientRect().height : 0));

    const altoEditor = limitar(L.editorAlto, MIN_PANEL_ALTO, altoDisponible - MIN_PANEL_ALTO);
    editorCont.style.flexGrow = String(altoEditor);
    editorCont.style.flexBasis = '0';
    editorCont.style.flexShrink = '1';
    resultadosCont.style.flexGrow = String(altoDisponible - altoEditor);
    resultadosCont.style.flexBasis = '0';
    resultadosCont.style.flexShrink = '1';

    // Historial: si está oculto, el panel y su divisor ocupan 0 px
    historial.classList.toggle('collapsed', !L.historialAbierto);
    document.getElementById('resizer-historial').classList.toggle('oculto', !L.historialAbierto);
    document.getElementById('btn-mostrar-historial').classList.toggle('oculto', L.historialAbierto);
    if (L.historialAbierto) {
        historial.style.flex = `0 0 ${anchoHistorialReal}px`;
    } else {
        historial.style.flex = '0 0 0px';
    }
}

/**
 * Reajusta los paneles si la ventana se achicó o agrandó.
 */
function ajustarLayoutAVentana() {
    aplicarLayout();
    if (estado.editor) estado.editor.refresh();
}

// ===== Preferencias (layout, base activa y expansión del explorador) =====
async function cargarPreferencias() {
    try {
        const resp = await fetch('/api/preferencias');
        const prefs = await resp.json();
        const layout = prefs && prefs.layout ? prefs.layout : {};

        // Tamaño de paneles y estado de plegado
        Object.keys(estado.layout).forEach(clave => {
            if (layout[clave] !== undefined && layout[clave] !== null) {
                estado.layout[clave] = layout[clave];
            }
        });

        // Estado de expansión del explorador
        if (Array.isArray(layout.basesExpandidas)) {
            layout.basesExpandidas.forEach(b => estado.basesExpandidas.add(b));
        }
        if (Array.isArray(layout.tablasExpandidas)) {
            layout.tablasExpandidas.forEach(t => estado.tablasExpandidas.add(t));
        }

        // Última base usada
        if (prefs.ultimaBase && !estado.baseDatosActiva) {
            estado.baseDatosActiva = prefs.ultimaBase;
        }

        aplicarLayout();
        if (estado.editor) estado.editor.refresh();

        // Si la base guardada todavía existe, dejarla seleccionada y como base de trabajo
        if (estado.baseDatosActiva) {
            seleccionarBase(estado.baseDatosActiva);
        }
    } catch (e) {
        // Sin preferencias guardadas: se usan los valores por defecto
    }
}

/**
 * Guarda el layout, la base activa y el estado de expansión en data/.
 * Se agrupan las llamadas para no escribir en disco en cada movimiento.
 */
function guardarPreferencias() {
    if (temporizadorGuardar) clearTimeout(temporizadorGuardar);

    temporizadorGuardar = setTimeout(async () => {
        const L = estado.layout;
        const layout = {
            sidebarWidth: L.sidebarWidth,
            exploradorAlto: L.exploradorAlto,
            consignasAlto: L.consignasAlto,
            exploradorAbierto: L.exploradorAbierto,
            consignasAbierto: L.consignasAbierto,
            historialAbierto: L.historialAbierto,
            historialWidth: L.historialWidth,
            editorAlto: L.editorAlto,
            basesExpandidas: Array.from(estado.basesExpandidas),
            tablasExpandidas: Array.from(estado.tablasExpandidas)
        };

        try {
            await fetch('/api/preferencias', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    layout: layout,
                    ultimaBase: estado.baseDatosActiva || ''
                })
            });
        } catch (e) {
            // Si no se puede guardar (pendrive protegido), la app sigue usable
        }
    }, 600);
}

// ===== Tema =====
function cargarTema() {
    const temaGuardado = localStorage.getItem('sqlplayground-tema');
    if (temaGuardado) {
        estado.tema = temaGuardado;
    }
    aplicarTema();
}

function alternarTema() {
    estado.tema = estado.tema === 'dark' ? 'light' : 'dark';
    localStorage.setItem('sqlplayground-tema', estado.tema);
    aplicarTema();
}

function aplicarTema() {
    document.documentElement.setAttribute('data-theme', estado.tema);

    // El botón muestra la luna en tema oscuro y el sol en tema claro
    const iconoTema = document.getElementById('icono-tema');
    if (iconoTema) {
        iconoTema.className = 'icono icono-md ' + (estado.tema === 'dark' ? 'icono-luna' : 'icono-sol');
    }

    // Cambiar tema de CodeMirror
    const cmTheme = estado.tema === 'dark' ? 'material-darker' : 'default';
    estado.editor.setOption('theme', cmTheme);
}

// ===== Conexión =====
async function verificarConexion() {
    const statusBadge = document.getElementById('connection-status');
    const statusText = statusBadge.querySelector('.status-text');
    const dbSelector = document.getElementById('db-selector');

    try {
        const resp = await fetch('/api/status');
        const data = await resp.json();

        if (data.activo) {
            statusBadge.className = 'status-badge active';
            statusText.textContent = 'Conectado';
            dbSelector.disabled = false;

            // El árbol NO se repinta en cada polling: solo cuando MySQL
            // recién vuelve de estar caído (o en el primer chequeo).
            if (estado.conexionActiva === false) {
                cargarBasesDeDatos();
            }
        } else {
            statusBadge.className = 'status-badge inactive';
            statusText.textContent = 'MySQL no está activo';
            dbSelector.disabled = true;
        }
        estado.conexionActiva = data.activo;
    } catch (e) {
        statusBadge.className = 'status-badge inactive';
        statusText.textContent = 'Error de conexión';
        dbSelector.disabled = true;
        estado.conexionActiva = false;
    }
}

// ===== Bases de datos =====
async function cargarBasesDeDatos() {
    const selector = document.getElementById('db-selector');
    const tree = document.getElementById('explorer-tree');

    try {
        const resp = await fetch('/api/databases');
        const bases = await resp.json();

        // Si el backend responde con un error, se muestra en vez de fallar en silencio
        if (!Array.isArray(bases)) {
            tree.textContent = '';
            tree.appendChild(crearErrorExplorador(bases && bases.error
                ? bases.error
                : 'No se pudieron cargar las bases de datos.', null));
            return;
        }

        estado.bases = bases;

        // Actualizar selector
        selector.innerHTML = '<option value="">Seleccionar base...</option>';
        bases.forEach(db => {
            const opt = document.createElement('option');
            opt.value = db;
            opt.textContent = db;
            if (db === estado.baseDatosActiva) opt.selected = true;
            selector.appendChild(opt);
        });

        // Actualizar árbol del explorador (restaurando lo expandido)
        renderizarExplorador();
    } catch (e) {
        tree.textContent = '';
        tree.appendChild(crearErrorExplorador('Error cargando bases de datos.', cargarBasesDeDatos));
    }
}

/**
 * Dibuja el árbol de bases. Al redibujar se restaura el estado de expansión
 * guardado en estado.basesExpandidas, sin volver a pedir las tablas ya cargadas.
 */
function renderizarExplorador() {
    const tree = document.getElementById('explorer-tree');
    tree.textContent = '';
    estado.contenedoresTablas.clear();

    if (estado.bases.length === 0) {
        const vacio = document.createElement('div');
        vacio.className = 'explorer-empty';
        vacio.textContent = 'No hay bases de datos para mostrar.';
        tree.appendChild(vacio);
        return;
    }

    // Las bases del sistema se agrupan al final, en su propia sección
    const propias = estado.bases.filter(db => !BASES_SISTEMA.includes(db.toLowerCase()));
    const delSistema = estado.bases.filter(db => BASES_SISTEMA.includes(db.toLowerCase()));

    if (propias.length > 0) {
        const titulo = document.createElement('div');
        titulo.className = 'explorer-seccion';
        titulo.textContent = 'Mis bases';
        tree.appendChild(titulo);
        propias.forEach(db => tree.appendChild(crearItemBase(db, false)));
    }

    if (delSistema.length > 0) {
        const titulo = document.createElement('div');
        titulo.className = 'explorer-seccion';
        titulo.textContent = 'Bases del sistema';
        tree.appendChild(titulo);
        delSistema.forEach(db => tree.appendChild(crearItemBase(db, true)));
    }
}

/**
 * Crea el nodo de una base de datos con su lista de tablas.
 * @param {string} db nombre de la base
 * @param {boolean} esSistema si es una base del sistema
 * @returns {HTMLElement} nodo completo de la base
 */
function crearItemBase(db, esSistema) {
    const dbItem = document.createElement('div');
    dbItem.className = 'db-item';

    const expandida = estado.basesExpandidas.has(db);

    const dbHeader = document.createElement('div');
    dbHeader.className = 'db-header' + (esSistema ? ' db-sistema' : '');

    const arrow = document.createElement('span');
    arrow.className = 'icono db-arrow' + (expandida ? ' expanded' : '');

    const icon = document.createElement('span');
    icon.className = 'icono db-icon icono-base';

    const nombre = document.createElement('span');
    nombre.className = 'db-name';
    nombre.textContent = db;

    dbHeader.appendChild(arrow);
    dbHeader.appendChild(icon);
    dbHeader.appendChild(nombre);

    // Marca la base con la que se está trabajando
    if (estado.baseDatosActiva === db) {
        dbHeader.classList.add('db-activa');
        nombre.title = 'Base de datos con la que se trabaja';
    }

    const tableList = document.createElement('div');
    tableList.className = 'table-list' + (expandida ? ' expanded' : '');
    estado.contenedoresTablas.set(db, tableList);

    // La flecha despliega o pliega; el nombre deja esa base como activa
    arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        alternarBase(db);
    });
    arrow.title = 'Desplegar o plegar las tablas';
    dbHeader.addEventListener('click', () => seleccionarBase(db));
    dbHeader.title = 'Dejar esta base como base de trabajo';

    dbItem.appendChild(dbHeader);
    dbItem.appendChild(tableList);

    // Si la base estaba expandida, se muestran sus tablas
    if (expandida) {
        pintarTablas(db);
    }

    return dbItem;
}

/**
 * Deja una base de datos como base de trabajo: se usa por defecto al ejecutar
 * consultas (no hace falta escribir USE) y se marca en el explorador.
 * @param {string} db nombre de la base, o vacío para trabajar sin base por defecto
 */
function seleccionarBase(db) {
    const base = db || null;
    estado.baseDatosActiva = base;

    // Sincronizar el desplegable del header
    const selector = document.getElementById('db-selector');
    if (selector && selector.value !== (base || '')) {
        selector.value = base || '';
    }

    // Marcar en el explorador cuál es la base activa
    document.querySelectorAll('#explorer-tree .db-header').forEach(header => {
        const nombre = header.querySelector('.db-name');
        header.classList.toggle('db-activa', !!base && nombre && nombre.textContent === base);
    });

    actualizarAutocompletado();

    // Avisarle al backend para que las siguientes consultas corran sobre esa base
    fetch('/api/base-activa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base: base || '' })
    }).catch(() => { });

    guardarPreferencias();
}

/**
 * Alterna la expansión de una base de datos.
 * @param {string} db nombre de la base
 */
function alternarBase(db) {
    if (estado.basesExpandidas.has(db)) {
        estado.basesExpandidas.delete(db);
    } else {
        estado.basesExpandidas.add(db);
    }

    const contenedor = estado.contenedoresTablas.get(db);
    if (contenedor) {
        const expandida = estado.basesExpandidas.has(db);
        contenedor.classList.toggle('expanded', expandida);
        const arrow = contenedor.previousElementSibling
            ? contenedor.previousElementSibling.querySelector('.db-arrow')
            : null;
        if (arrow) arrow.classList.toggle('expanded', expandida);

        if (expandida) {
            pintarTablas(db);
        } else {
            contenedor.textContent = '';
        }
    }

    guardarPreferencias();
}

/**
 * Pinta las tablas de una base, cargándolas si hace falta (carga perezosa).
 * @param {string} baseDatos nombre de la base
 */
function pintarTablas(baseDatos) {
    const contenedor = estado.contenedoresTablas.get(baseDatos);
    if (!contenedor) return;

    const cache = estado.tablasCache[baseDatos];
    if (!cache) {
        contenedor.textContent = '';
        const cargando = document.createElement('div');
        cargando.className = 'explorer-loading';
        cargando.textContent = 'Cargando…';
        contenedor.appendChild(cargando);
        cargarTablas(baseDatos);
        return;
    }

    contenedor.textContent = '';

    if (cache.error) {
        contenedor.appendChild(crearErrorExplorador(cache.error, () => {
            delete estado.tablasCache[baseDatos];
            pintarTablas(baseDatos);
        }));
        return;
    }

    if (!cache.tablas || cache.tablas.length === 0) {
        const vacio = document.createElement('div');
        vacio.className = 'explorer-empty';
        vacio.textContent = 'Sin tablas';
        contenedor.appendChild(vacio);
        return;
    }

    cache.tablas.forEach(tabla => {
        contenedor.appendChild(crearItemTabla(baseDatos, tabla));
    });
}

/**
 * Crea el elemento de una tabla, con su flecha para ver las columnas.
 * @param {string} baseDatos nombre de la base
 * @param {string} tabla nombre de la tabla
 * @returns {HTMLElement} elemento listo para insertar
 */
function crearItemTabla(baseDatos, tabla) {
    const clave = claveTabla(baseDatos, tabla);
    const expandida = estado.tablasExpandidas.has(clave);

    const item = document.createElement('div');
    item.className = 'table-item';
    item.title = 'Doble clic: generar SELECT * LIMIT 100';

    const arrow = document.createElement('span');
    arrow.className = 'icono table-arrow' + (expandida ? ' expanded' : '');
    arrow.title = 'Ver columnas';

    const icon = document.createElement('span');
    icon.className = 'icono table-icon icono-tabla';

    const nombre = document.createElement('span');
    nombre.className = 'table-name';
    nombre.textContent = tabla;

    item.appendChild(arrow);
    item.appendChild(icon);
    item.appendChild(nombre);

    // La flecha despliega las columnas
    arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        alternarColumnas(baseDatos, tabla, item);
    });

    // Doble clic: genera la consulta en el editor
    item.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        insertarEnEditor(`SELECT * FROM \`${baseDatos}\`.\`${tabla}\` LIMIT 100;`);
    });

    if (expandida) {
        item.appendChild(crearContenedorColumnas(baseDatos, tabla));
    }

    return item;
}

/**
 * Alterna la expansión de columnas de una tabla.
 * @param {string} baseDatos nombre de la base
 * @param {string} tabla nombre de la tabla
 * @param {HTMLElement} item elemento de la tabla
 */
function alternarColumnas(baseDatos, tabla, item) {
    const clave = claveTabla(baseDatos, tabla);

    if (estado.tablasExpandidas.has(clave)) {
        estado.tablasExpandidas.delete(clave);
        const existente = item.querySelector('.column-list');
        if (existente) existente.remove();
    } else {
        estado.tablasExpandidas.add(clave);
        item.appendChild(crearContenedorColumnas(baseDatos, tabla));
    }

    const arrow = item.querySelector('.table-arrow');
    if (arrow) arrow.classList.toggle('expanded', estado.tablasExpandidas.has(clave));

    guardarPreferencias();
}

/**
 * Crea el contenedor donde se pintan las columnas de una tabla.
 * @param {string} baseDatos nombre de la base
 * @param {string} tabla nombre de la tabla
 * @returns {HTMLElement} contenedor de columnas
 */
function crearContenedorColumnas(baseDatos, tabla) {
    const clave = claveTabla(baseDatos, tabla);
    const contenedor = document.createElement('div');
    contenedor.className = 'column-list';

    const cache = estado.columnasCache[clave];
    if (!cache) {
        const cargando = document.createElement('div');
        cargando.className = 'explorer-loading';
        cargando.textContent = 'Cargando…';
        contenedor.appendChild(cargando);
        cargarColumnas(baseDatos, tabla, contenedor);
        return contenedor;
    }

    if (cache.error) {
        contenedor.appendChild(crearErrorExplorador(cache.error, () => {
            delete estado.columnasCache[clave];
            if (estado.tablasExpandidas.has(clave)) {
                refrescarColumnasVisibles(baseDatos, tabla);
            }
        }));
        return contenedor;
    }

    if (!cache.columnas || cache.columnas.length === 0) {
        const vacio = document.createElement('div');
        vacio.className = 'explorer-empty';
        vacio.textContent = 'Sin columnas';
        contenedor.appendChild(vacio);
        return contenedor;
    }

    cache.columnas.forEach(columna => {
        const item = document.createElement('div');
        item.className = 'column-item';

        const nombre = document.createElement('span');
        nombre.className = 'column-name';
        nombre.textContent = columna.nombre;

        const tipo = document.createElement('span');
        tipo.className = 'column-type';
        tipo.textContent = columna.tipo || '';

        item.appendChild(nombre);
        item.appendChild(tipo);

        if (columna.clave) {
            const claveCol = document.createElement('span');
            claveCol.className = 'column-key';
            claveCol.textContent = columna.clave === 'PRI' ? 'PK' : columna.clave;
            item.appendChild(claveCol);
        }

        // Doble clic sobre la columna: la inserta en el editor
        item.title = 'Doble clic: insertar en el editor';
        item.addEventListener('dblclick', () => insertarEnEditor('`' + columna.nombre + '`'));

        contenedor.appendChild(item);
    });

    return contenedor;
}

/**
 * Vuelve a pintar el contenedor de columnas de una tabla visible en el árbol.
 * @param {string} baseDatos nombre de la base
 * @param {string} tabla nombre de la tabla
 */
function refrescarColumnasVisibles(baseDatos, tabla) {
    const contenedorBase = estado.contenedoresTablas.get(baseDatos);
    if (!contenedorBase) return;

    const lista = contenedorBase.querySelectorAll('.table-item');
    lista.forEach(item => {
        const nombre = item.querySelector('.table-name');
        if (nombre && nombre.textContent === tabla) {
            const vieja = item.querySelector('.column-list');
            if (vieja) vieja.remove();
            item.appendChild(crearContenedorColumnas(baseDatos, tabla));
        }
    });
}

/**
 * Pide las tablas de una base al backend y las guarda en caché.
 * @param {string} baseDatos nombre de la base
 */
async function cargarTablas(baseDatos) {
    try {
        const resp = await fetch(`/api/tables?database=${encodeURIComponent(baseDatos)}`);
        const data = await resp.json();

        estado.tablasCache[baseDatos] = {
            tablas: Array.isArray(data.tablas) ? data.tablas : [],
            error: data.error || ''
        };

        pintarTablas(baseDatos);
        actualizarAutocompletado();
    } catch (e) {
        estado.tablasCache[baseDatos] = { tablas: [], error: 'No se pudieron cargar las tablas.' };
        pintarTablas(baseDatos);
    }
}

/**
 * Pide las columnas de una tabla al backend y las guarda en caché.
 * @param {string} baseDatos nombre de la base
 * @param {string} tabla nombre de la tabla
 * @param {HTMLElement} contenedor donde se pintan las columnas
 */
async function cargarColumnas(baseDatos, tabla, contenedor) {
    try {
        const url = `/api/columns?database=${encodeURIComponent(baseDatos)}`
            + `&table=${encodeURIComponent(tabla)}`;
        const resp = await fetch(url);
        const data = await resp.json();

        estado.columnasCache[claveTabla(baseDatos, tabla)] = {
            columnas: Array.isArray(data.columnas) ? data.columnas : [],
            error: data.error || ''
        };

        // Reemplazar el "Cargando…" por el contenido real
        const nuevo = crearContenedorColumnas(baseDatos, tabla);
        contenedor.replaceWith(nuevo);
    } catch (e) {
        estado.columnasCache[claveTabla(baseDatos, tabla)] = {
            columnas: [],
            error: 'No se pudieron cargar las columnas.'
        };
        contenedor.replaceWith(crearContenedorColumnas(baseDatos, tabla));
    }
}

/**
 * Arma la clave única de una tabla.
 * @param {string} baseDatos nombre de la base
 * @param {string} tabla nombre de la tabla
 * @returns {string} clave
 */
function claveTabla(baseDatos, tabla) {
    return baseDatos + ' ' + tabla;
}

/**
 * Crea el bloque de error del explorador, con botón de reintento.
 * @param {string} mensaje texto del error
 * @param {Function|null} reintentar función a llamar al reintentar
 * @returns {HTMLElement} elemento de error
 */
function crearErrorExplorador(mensaje, reintentar) {
    const div = document.createElement('div');
    div.className = 'explorer-error';

    const texto = document.createElement('div');
    texto.textContent = mensaje;
    div.appendChild(texto);

    if (reintentar) {
        const boton = document.createElement('button');
        boton.className = 'btn btn-small';
        boton.textContent = 'Reintentar';
        boton.addEventListener('click', reintentar);
        div.appendChild(boton);
    }

    return div;
}

// ===== Pestañas =====
function crearPestaña(nombre, contenido = '') {
    const id = 'tab-' + Date.now();
    const pestaña = { id, nombre, contenido };
    estado.pestañas.push(pestaña);

    renderizarPestañas();
    activarPestaña(id);

    if (contenido) {
        estado.editor.setValue(contenido);
    }
}

function renderizarPestañas() {
    const container = document.getElementById('tabs');
    container.innerHTML = '';

    estado.pestañas.forEach(pestaña => {
        const tab = document.createElement('div');
        tab.className = 'tab' + (pestaña.id === estado.pestañaActiva ? ' active' : '');
        tab.dataset.id = pestaña.id;

        const nombreSpan = document.createElement('span');
        nombreSpan.className = 'tab-name';
        nombreSpan.textContent = pestaña.nombre;

        const closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close icono icono-cerrar';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cerrarPestaña(pestaña.id);
        });

        tab.appendChild(nombreSpan);
        tab.appendChild(closeBtn);

        tab.addEventListener('click', () => activarPestaña(pestaña.id));
        tab.addEventListener('dblclick', (e) => {
            if (e.target === nombreSpan) {
                renombrarPestaña(pestaña);
            }
        });

        container.appendChild(tab);
    });
}

function activarPestaña(id) {
    // Guardar contenido de la pestaña actual
    if (estado.pestañaActiva) {
        const pestañaActual = estado.pestañas.find(p => p.id === estado.pestañaActiva);
        if (pestañaActual) {
            pestañaActual.contenido = estado.editor.getValue();
        }
    }

    estado.pestañaActiva = id;
    const pestaña = estado.pestañas.find(p => p.id === id);
    if (pestaña) {
        estado.editor.setValue(pestaña.contenido || '');
    }

    renderizarPestañas();
}

function cerrarPestaña(id) {
    const index = estado.pestañas.findIndex(p => p.id === id);
    if (index === -1) return;

    estado.pestañas.splice(index, 1);

    if (estado.pestañas.length === 0) {
        crearPestaña('Nueva consulta');
    } else if (id === estado.pestañaActiva) {
        const nuevaPestaña = estado.pestañas[Math.max(0, index - 1)];
        activarPestaña(nuevaPestaña.id);
    }

    renderizarPestañas();
}

async function renombrarPestaña(pestaña) {
    const nuevoNombre = await pedirTexto({
        titulo: 'Renombrar pestaña',
        valor: pestaña.nombre,
        requiereTexto: true
    });
    if (nuevoNombre) {
        pestaña.nombre = nuevoNombre;
        renderizarPestañas();
    }
}

// ===== Ejecución de consultas =====
async function ejecutarConsulta() {
    const editor = estado.editor;
    let sql = editor.getSelection() || editor.getValue();

    if (!sql.trim()) {
        mostrarMensaje('Escribe una consulta SQL primero');
        return;
    }

    const container = document.getElementById('results-container');
    container.innerHTML = '<div class="results-placeholder">Ejecutando...</div>';

    try {
        const resp = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: sql
        });

        const resultados = await resp.json();
        renderizarResultados(resultados);

        // Si el usuario escribió USE / CREATE DATABASE / DROP DATABASE,
        // el desplegable y la base de trabajo se actualizan solos
        sincronizarBaseDesdeSentencias(resultados);

        // Si se creó o se borró algo, el explorador se refresca (restaurando la expansión)
        if (resultados.some(r => !r.error && r.sql && RE_SENTENCIA_DDL.test(r.sql))) {
            estado.tablasCache = {};
            estado.columnasCache = {};
            cargarBasesDeDatos();
        }
    } catch (e) {
        container.innerHTML = `
            <div class="error-container">
                <div class="error-title">Error de conexión</div>
                <div class="error-message">${escapeHtml(e.message)}</div>
            </div>
        `;
    }
}

/**
 * Revisa las sentencias ejecutadas y actualiza la base de trabajo si alguna
 * la cambió (USE, CREATE DATABASE, DROP DATABASE).
 * @param {Array} resultados resultados devueltos por el backend
 */
function sincronizarBaseDesdeSentencias(resultados) {
    let cambio = null;

    resultados.forEach(r => {
        if (r.error || !r.sql) return;
        const sql = r.sql.trim();
        let m = sql.match(RE_BORRAR_BASE);
        if (m) {
            cambio = { base: null };
            return;
        }
        m = sql.match(RE_USO_BASE) || sql.match(RE_CREAR_BASE);
        if (m) {
            cambio = { base: m[1] };
        }
    });

    if (cambio && cambio.base !== estado.baseDatosActiva) {
        seleccionarBase(cambio.base);
    }
}

function renderizarResultados(resultados) {
    const container = document.getElementById('results-container');
    container.innerHTML = '';

    resultados.forEach((resultado, index) => {
        const divResultado = document.createElement('div');
        divResultado.className = 'resultado-item';

        if (resultado.error) {
            // Mostrar error
            divResultado.innerHTML = `
                <div class="error-container">
                    <div class="error-title">Error SQL${resultado.codigoError ? ' (código ' + resultado.codigoError + ')' : ''}</div>
                    <div class="error-message">${escapeHtml(resultado.mensajeError || 'Error desconocido')}</div>
                    ${resultado.sql ? `<div class="error-sql">${escapeHtml(resultado.sql)}</div>` : ''}
                </div>
            `;
        } else if (resultado.columnas) {
            // Mostrar tabla de resultados
            const infoHtml = `
                <div class="results-info">
                    <span class="info-item">Tiempo: <span class="info-value">${resultado.tiempoEjecucion} ms</span></span>
                    <span class="info-item">Filas: <span class="info-value">${resultado.totalFilas}</span></span>
                    ${resultado.truncado ? '<span class="warning">Aviso: se muestran solo las primeras 1000 filas</span>' : ''}
                </div>
            `;

            let tablaHtml = '<div class="results-table-wrapper"><table class="results-table"><thead><tr>';
            resultado.columnas.forEach(col => {
                tablaHtml += `<th>${escapeHtml(col)}</th>`;
            });
            tablaHtml += '</tr></thead><tbody>';

            resultado.filas.forEach(fila => {
                tablaHtml += '<tr>';
                fila.forEach(celda => {
                    if (celda === null) {
                        tablaHtml += '<td class="null-value">NULL</td>';
                    } else {
                        tablaHtml += `<td>${escapeHtml(celda)}</td>`;
                    }
                });
                tablaHtml += '</tr>';
            });

            tablaHtml += '</tbody></table></div>';
            divResultado.innerHTML = infoHtml + tablaHtml;
        } else {
            // Sentencia de modificación (INSERT, UPDATE, DELETE, etc.)
            divResultado.innerHTML = `
                <div class="results-info">
                    <span class="info-item">Tiempo: <span class="info-value">${resultado.tiempoEjecucion} ms</span></span>
                    <span class="info-item">Filas afectadas: <span class="info-value">${resultado.filasAfectadas}</span></span>
                </div>
            `;
        }

        container.appendChild(divResultado);
    });
}

// ===== Modal propio (reemplaza alert/confirm/prompt del navegador) =====

/**
 * Pide un texto (o varias líneas) y devuelve lo que el usuario escribió.
 * @param {Object} opciones titulo, mensaje, valor, multilinea, requiereTexto
 * @returns {Promise<string|null>} el texto, o null si se canceló
 */
function pedirTexto(opciones = {}) {
    return modal({ ...opciones, confirmar: false });
}

/**
 * Pide confirmación y devuelve si el usuario aceptó.
 * @param {Object} opciones titulo, mensaje, aceptar, cancelar, peligro
 * @returns {Promise<boolean>} true si aceptó, false si canceló
 */
function pedirConfirmacion(opciones = {}) {
    return modal({ ...opciones, confirmar: true });
}

/**
 * Abre el modal propio y devuelve lo que el usuario responda.
 * @param {Object} opciones titulo, mensaje, valor, multilinea, requiereTexto, confirmar, aceptar, cancelar, peligro
 * @returns {Promise<string|boolean|null>} texto, true/false en confirmaciones, null si se canceló
 */
function modal(opciones = {}) {
    return new Promise(resolve => {
        const capa = document.getElementById('modal-capa');
        const titulo = document.getElementById('modal-titulo');
        const mensaje = document.getElementById('modal-mensaje');
        const input = document.getElementById('modal-input');
        const area = document.getElementById('modal-area');
        const btnAceptar = document.getElementById('modal-aceptar');
        const btnCancelar = document.getElementById('modal-cancelar');

        const esConfirmacion = opciones.confirmar === true;
        const multilinea = opciones.multilinea === true;

        titulo.textContent = opciones.titulo || '';
        mensaje.textContent = opciones.mensaje || '';
        mensaje.classList.toggle('oculto', !opciones.mensaje);

        // En las confirmaciones no hay campo de texto
        if (esConfirmacion) {
            input.classList.add('oculto');
            area.classList.add('oculto');
        } else if (multilinea) {
            input.classList.add('oculto');
            area.classList.remove('oculto');
            area.value = opciones.valor || '';
        } else {
            input.classList.remove('oculto');
            area.classList.add('oculto');
            input.value = opciones.valor || '';
        }

        btnAceptar.textContent = opciones.aceptar || (esConfirmacion ? 'Sí' : 'Aceptar');
        btnCancelar.textContent = opciones.cancelar || 'Cancelar';
        btnAceptar.classList.toggle('btn-peligro', opciones.peligro === true);
        btnAceptar.classList.toggle('btn-primary', opciones.peligro !== true);

        capa.classList.remove('oculto');

        const campo = esConfirmacion ? null : (multilinea ? area : input);
        if (campo) {
            campo.focus();
            campo.setSelectionRange(campo.value.length, campo.value.length);
        } else {
            btnAceptar.focus();
        }

        function cerrar(resultado) {
            document.removeEventListener('keydown', alTeclado, true);
            btnAceptar.removeEventListener('click', confirmar);
            btnCancelar.removeEventListener('click', cancelar);
            capa.removeEventListener('mousedown', alFondo);
            capa.classList.add('oculto');
            resolve(resultado);
        }

        function confirmar() {
            if (esConfirmacion) {
                cerrar(true);
                return;
            }
            const valor = (multilinea ? area.value : input.value);
            if (!valor.trim() && opciones.requiereTexto) {
                mostrarAviso('Tenés que escribir algo.', true);
                if (campo) campo.focus();
                return;
            }
            cerrar(valor.trim());
        }

        function cancelar() {
            cerrar(esConfirmacion ? false : null);
        }

        // Clic en el fondo (fuera del cuadro) cancela
        function alFondo(e) {
            if (e.target === capa) cancelar();
        }

        function alTeclado(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                cancelar();
            } else if (e.key === 'Enter' && (!multilinea || e.ctrlKey)) {
                e.preventDefault();
                confirmar();
            }
        }

        btnAceptar.addEventListener('click', confirmar);
        btnCancelar.addEventListener('click', cancelar);
        capa.addEventListener('mousedown', alFondo);
        document.addEventListener('keydown', alTeclado, true);
    });
}

/**
 * Indica si hay un modal abierto (para no ejecutar atajos detrás de él).
 * @returns {boolean} true si el modal está visible
 */
function modalAbierto() {
    const capa = document.getElementById('modal-capa');
    return capa && !capa.classList.contains('oculto');
}

/**
 * Muestra un aviso breve que no bloquea (reemplaza a alert).
 * @param {string} texto mensaje a mostrar
 * @param {boolean} error si es un aviso de error
 */
function mostrarAviso(texto, error = false) {
    const caja = document.getElementById('avisos');
    const aviso = document.createElement('div');
    aviso.className = 'aviso' + (error ? ' aviso-error' : ' aviso-ok');
    aviso.textContent = texto;
    caja.appendChild(aviso);

    setTimeout(() => {
        aviso.style.opacity = '0';
        aviso.style.transition = 'opacity 0.3s';
        setTimeout(() => aviso.remove(), 300);
    }, 2600);
}

// ===== Utilidades =====
function insertarEnEditor(texto) {
    const editor = estado.editor;
    const cursor = editor.getCursor();
    editor.replaceRange(texto, cursor);
    editor.focus();
}

function actualizarAutocompletado() {
    if (!estado.baseDatosActiva) return;

    const cache = estado.tablasCache[estado.baseDatosActiva];
    const tablas = {};

    if (cache && !cache.error && Array.isArray(cache.tablas)) {
        cache.tablas.forEach(tabla => {
            tablas[tabla] = [];
        });
    }

    estado.editor.setOption('hintOptions', { tables: tablas });
}

function mostrarMensaje(msg) {
    const container = document.getElementById('results-container');
    container.innerHTML = `<div class="results-placeholder">${escapeHtml(msg)}</div>`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Consignas =====
function inicializarConsignas() {
    cargarConjuntosConsignas();

    // Eventos
    document.getElementById('btn-nuevo-conjunto').addEventListener('click', crearNuevoConjunto);
    document.getElementById('btn-agregar-consigna').addEventListener('click', agregarConsigna);
    document.getElementById('btn-pegar-consignas').addEventListener('click', pegarConsignas);
    document.getElementById('btn-desmarcar-todas').addEventListener('click', desmarcarTodas);
    document.getElementById('consignas-conjunto-selector').addEventListener('change', (e) => {
        activarConjunto(e.target.value);
    });
}

async function cargarConjuntosConsignas() {
    try {
        const resp = await fetch('/api/consignas/conjuntos');
        const data = await resp.json();

        // Llenar selector de conjuntos
        const selector = document.getElementById('consignas-conjunto-selector');
        selector.innerHTML = '';
        data.conjuntos.forEach(conjunto => {
            const opt = document.createElement('option');
            opt.value = conjunto.id;
            opt.textContent = conjunto.nombre;
            if (conjunto.id === data.activo?.id) opt.selected = true;
            selector.appendChild(opt);
        });

        // Cargar consignas del conjunto activo
        await cargarConsignas();
    } catch (e) {
        console.error('Error cargando conjuntos:', e);
    }
}

async function cargarConsignas() {
    try {
        const resp = await fetch('/api/consignas');
        const data = await resp.json();

        // Actualizar progreso
        actualizarProgreso(data.progreso);

        // Renderizar consignas
        renderizarConsignas(data.conjunto?.consignas || []);
    } catch (e) {
        console.error('Error cargando consignas:', e);
    }
}

function actualizarProgreso(progreso) {
    const texto = document.getElementById('progreso-texto');
    const relleno = document.getElementById('progreso-relleno');

    texto.textContent = `${progreso.completadas}/${progreso.total}`;

    const porcentaje = progreso.total > 0 ? (progreso.completadas / progreso.total) * 100 : 0;
    relleno.style.width = `${porcentaje}%`;
}

function renderizarConsignas(consignas) {
    const lista = document.getElementById('consignas-lista');
    lista.innerHTML = '';

    if (consignas.length === 0) {
        lista.innerHTML = '<div class="consignas-empty">No hay consignas. Agrega una o pega un bloque de texto.</div>';
        return;
    }

    consignas.forEach(consigna => {
        const item = document.createElement('div');
        item.className = 'consigna-item' + (consigna.completada ? ' completada' : '');
        item.dataset.id = consigna.id;

        item.innerHTML = `
            <input type="checkbox" class="consigna-checkbox" ${consigna.completada ? 'checked' : ''}>
            <span class="consigna-texto">${escapeHtml(consigna.texto)}</span>
            <div class="consigna-acciones">
                <button class="btn-editar" title="Editar"><span class="icono icono-lapiz"></span></button>
                <button class="btn-eliminar" title="Eliminar"><span class="icono icono-papelera"></span></button>
            </div>
        `;

        // Eventos
        const checkbox = item.querySelector('.consigna-checkbox');
        checkbox.addEventListener('change', () => toggleConsigna(consigna.id));

        const btnEditar = item.querySelector('.btn-editar');
        btnEditar.addEventListener('click', () => editarConsigna(consigna));

        const btnEliminar = item.querySelector('.btn-eliminar');
        btnEliminar.addEventListener('click', () => eliminarConsigna(consigna.id));

        lista.appendChild(item);
    });
}

async function crearNuevoConjunto() {
    const nombre = await pedirTexto({
        titulo: 'Nuevo conjunto de consignas',
        mensaje: 'Por ejemplo: Práctica 1, Parcial, TP 2...',
        requiereTexto: true
    });
    if (!nombre) return;

    try {
        const resp = await fetch('/api/consignas/conjuntos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombre.trim() })
        });

        if (resp.ok) {
            await cargarConjuntosConsignas();
        }
    } catch (e) {
        console.error('Error creando conjunto:', e);
    }
}

async function activarConjunto(id) {
    if (!id) return;

    try {
        await fetch(`/api/consignas/conjuntos/${id}/activar`, { method: 'PUT' });
        await cargarConsignas();
    } catch (e) {
        console.error('Error activando conjunto:', e);
    }
}

async function agregarConsigna() {
    const texto = await pedirTexto({
        titulo: 'Nueva consigna',
        mensaje: 'Escribí la consigna y presioná Aceptar (o Enter).',
        requiereTexto: true
    });
    if (!texto) return;

    try {
        const resp = await fetch('/api/consignas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto: texto.trim() })
        });

        if (resp.ok) {
            await cargarConsignas();
        }
    } catch (e) {
        console.error('Error agregando consigna:', e);
    }
}

async function pegarConsignas() {
    const texto = await pedirTexto({
        titulo: 'Pegar varias consignas',
        mensaje: 'Una consigna por línea. Se agregan todas de una vez.',
        multilinea: true,
        requiereTexto: true,
        aceptar: 'Agregar'
    });
    if (!texto) return;

    try {
        const resp = await fetch('/api/consignas/lote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto })
        });

        if (resp.ok) {
            await cargarConsignas();
        }
    } catch (e) {
        console.error('Error pegando consignas:', e);
    }
}

async function editarConsigna(consigna) {
    const nuevoTexto = await pedirTexto({
        titulo: 'Editar consigna',
        valor: consigna.texto,
        multilinea: true,
        requiereTexto: true
    });
    if (!nuevoTexto || nuevoTexto === consigna.texto) return;

    try {
        const resp = await fetch(`/api/consignas/${consigna.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto: nuevoTexto.trim() })
        });

        if (resp.ok) {
            await cargarConsignas();
        }
    } catch (e) {
        console.error('Error editando consigna:', e);
    }
}

async function eliminarConsigna(id) {
    const confirmar = await pedirConfirmacion({
        titulo: 'Eliminar consigna',
        mensaje: '¿Querés eliminar esta consigna?',
        aceptar: 'Eliminar',
        peligro: true
    });
    if (!confirmar) return;

    try {
        const resp = await fetch(`/api/consignas/${id}`, { method: 'DELETE' });
        if (resp.ok) {
            await cargarConsignas();
        }
    } catch (e) {
        console.error('Error eliminando consigna:', e);
    }
}

async function toggleConsigna(id) {
    try {
        await fetch(`/api/consignas/${id}/toggle`, { method: 'PUT' });
        await cargarConsignas();
    } catch (e) {
        console.error('Error toggle consigna:', e);
    }
}

async function desmarcarTodas() {
    const confirmar = await pedirConfirmacion({
        titulo: 'Desmarcar todas',
        mensaje: 'Se desmarcan todas las consignas del conjunto. ¿Seguís?',
        aceptar: 'Desmarcar todas',
        peligro: true
    });
    if (!confirmar) return;

    try {
        const resp = await fetch('/api/consignas/desmarcar-todas', { method: 'POST' });
        if (resp.ok) {
            await cargarConsignas();
        }
    } catch (e) {
        console.error('Error desmarcando consignas:', e);
    }
}

// ===== Historial y Favoritos =====
function inicializarHistorial() {
    // Eventos
    document.getElementById('btn-limpiar-historial').addEventListener('click', limpiarHistorial);

    // Tabs historial/favoritos
    document.querySelectorAll('.historial-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.historial-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tipo = tab.dataset.tab;
            if (tipo === 'historial') {
                cargarHistorial();
            } else {
                cargarFavoritos();
            }
        });
    });

    cargarHistorial();
}

async function cargarHistorial() {
    const lista = document.getElementById('historial-lista');
    lista.innerHTML = '<div class="historial-empty">Cargando...</div>';

    try {
        const resp = await fetch('/api/historial');
        const historial = await resp.json();

        if (historial.length === 0) {
            lista.innerHTML = '<div class="historial-empty">No hay consultas en el historial</div>';
            return;
        }

        lista.innerHTML = '';
        // Mostrar más recientes primero
        historial.slice().reverse().forEach(entrada => {
            const item = document.createElement('div');
            item.className = 'historial-item';
            item.dataset.id = entrada.id;

            const fecha = new Date(entrada.fecha).toLocaleString();

            item.innerHTML = `
                <div class="historial-sql" title="${escapeHtml(entrada.sql)}">${escapeHtml(entrada.sql)}</div>
                <div class="historial-fecha">${fecha}</div>
                <div class="historial-acciones">
                    <button class="btn-cargar" title="Cargar en editor"><span class="icono icono-cargar"></span> Cargar</button>
                    <button class="btn-favorito" title="Marcar como favorito">⭐ Favorito</button>
                    <button class="btn-eliminar" title="Eliminar"><span class="icono icono-papelera"></span></button>
                </div>
            `;

            // Cargar en editor al hacer clic
            item.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                insertarEnEditor(entrada.sql);
            });

            // Botones
            item.querySelector('.btn-cargar').addEventListener('click', () => {
                insertarEnEditor(entrada.sql);
            });

            item.querySelector('.btn-favorito').addEventListener('click', async () => {
                await marcarComoFavorito(entrada.id);
            });

            item.querySelector('.btn-eliminar').addEventListener('click', async () => {
                await eliminarDelHistorial(entrada.id);
            });

            lista.appendChild(item);
        });
    } catch (e) {
        lista.innerHTML = '<div class="historial-empty">Error cargando historial</div>';
    }
}

async function cargarFavoritos() {
    const lista = document.getElementById('historial-lista');
    lista.innerHTML = '<div class="historial-empty">Cargando...</div>';

    try {
        const resp = await fetch('/api/favoritos');
        const favoritos = await resp.json();

        if (favoritos.length === 0) {
            lista.innerHTML = '<div class="historial-empty">No hay favoritos</div>';
            return;
        }

        lista.innerHTML = '';
        favoritos.forEach(fav => {
            const item = document.createElement('div');
            item.className = 'historial-item';
            item.dataset.id = fav.id;

            const fecha = new Date(fav.fecha).toLocaleString();

            item.innerHTML = `
                <div class="historial-sql" title="${escapeHtml(fav.sql)}">${escapeHtml(fav.nombre || fav.sql)}</div>
                <div class="historial-fecha">${fecha}</div>
                <div class="historial-acciones">
                    <button class="btn-cargar" title="Cargar en editor"><span class="icono icono-cargar"></span> Cargar</button>
                    <button class="btn-eliminar" title="Eliminar"><span class="icono icono-papelera"></span></button>
                </div>
            `;

            item.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                insertarEnEditor(fav.sql);
            });

            item.querySelector('.btn-cargar').addEventListener('click', () => {
                insertarEnEditor(fav.sql);
            });

            item.querySelector('.btn-eliminar').addEventListener('click', async () => {
                await eliminarFavorito(fav.id);
            });

            lista.appendChild(item);
        });
    } catch (e) {
        lista.innerHTML = '<div class="historial-empty">Error cargando favoritos</div>';
    }
}

async function limpiarHistorial() {
    const confirmar = await pedirConfirmacion({
        titulo: 'Limpiar el historial',
        mensaje: 'Se borran todas las consultas guardadas. ¿Seguís?',
        aceptar: 'Limpiar',
        peligro: true
    });
    if (!confirmar) return;

    try {
        await fetch('/api/historial', { method: 'DELETE' });
        cargarHistorial();
    } catch (e) {
        console.error('Error limpiando historial:', e);
    }
}

async function eliminarDelHistorial(id) {
    try {
        await fetch(`/api/historial/${id}`, { method: 'DELETE' });
        cargarHistorial();
    } catch (e) {
        console.error('Error eliminando del historial:', e);
    }
}

async function marcarComoFavorito(idHistorial) {
    try {
        const resp = await fetch(`/api/historial/${idHistorial}/favorito`, { method: 'POST' });
        if (resp.ok) {
            mostrarAviso('Agregado a favoritos');
        }
    } catch (e) {
        console.error('Error marcando como favorito:', e);
    }
}

async function eliminarFavorito(id) {
    const confirmar = await pedirConfirmacion({
        titulo: 'Quitar de favoritos',
        mensaje: '¿Querés quitar esta consulta de los favoritos?',
        aceptar: 'Quitar',
        peligro: true
    });
    if (!confirmar) return;

    try {
        await fetch(`/api/favoritos/${id}`, { method: 'DELETE' });
        cargarFavoritos();
    } catch (e) {
        console.error('Error eliminando favorito:', e);
    }
}
