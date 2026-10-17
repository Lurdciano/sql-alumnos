// Genera el logo "SQL" en varios formatos:
//   build/sqlalumnos.ico                    -> icono del ejecutable
//   src/main/resources/public/logo.svg      -> logo del header y favicon moderno
//   src/main/resources/public/favicon.ico   -> favicon de la pestaña
// Uso: node build/generar-icono.cjs
// Los archivos generados quedan versionados: el usuario final no necesita Node.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Fuente 5x7 para las tres letras (1 = blanco)
const LETRAS = {
    S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####']
};
const ANCHO = 5;
const ALTO = 7;
const COLOR_BORDE = '#4EC9B0';
const COLOR_FONDO = '#1E4B73';
const COLOR_TEXTO = '#FFFFFF';

/**
 * Geometría de las letras "SQL" dentro de un lienzo de tam x tam.
 * La comparten el dibujo en píxeles (.ico) y el vector (.svg) para que
 * el ejecutable y el logo se vean iguales.
 */
function geometriaTexto(tam) {
    const texto = 'SQL';
    const separacion = Math.max(1, Math.round(tam * 0.04));
    const anchoTotal = ANCHO * texto.length + separacion * (texto.length - 1);
    const escalaAncho = Math.floor((tam * 0.78) / anchoTotal);
    const escalaAlto = Math.floor((tam * 0.46) / ALTO);
    const escala = Math.max(1, Math.min(escalaAncho, escalaAlto));

    const margen = Math.round(tam * 0.06);
    const grosor = Math.max(1, Math.round(tam * 0.05));

    return {
        escala,
        margen,
        grosor,
        separacion,
        xInicial: Math.round((tam - anchoTotal * escala) / 2),
        yInicial: Math.round((tam - ALTO * escala) / 2),
        celdas: []
    };
}

// Dibuja el icono en un buffer RGBA de tam*tam (sin librerias externas)
function dibujar(tam) {
    const px = Buffer.alloc(tam * tam * 4, 0);
    const g = geometriaTexto(tam);
    const margen = g.margen;
    const grosor = g.grosor;
    const borde = [78, 201, 176, 255];   // turquesa
    const fondo = [30, 75, 115, 255];    // azul
    const blanco = [255, 255, 255, 255];

    const pintar = (x, y, color) => {
        if (x < 0 || y < 0 || x >= tam || y >= tam) return;
        const i = (y * tam + x) * 4;
        px[i] = color[0]; px[i + 1] = color[1]; px[i + 2] = color[2]; px[i + 3] = color[3];
    };

    // Cuadro de fondo con borde
    for (let y = margen; y < tam - margen; y++) {
        for (let x = margen; x < tam - margen; x++) {
            const enBorde = x < margen + grosor || x >= tam - margen - grosor
                || y < margen + grosor || y >= tam - margen - grosor;
            pintar(x, y, enBorde ? borde : fondo);
        }
    }

    // Texto "SQL" centrado
    const texto = 'SQL';
    for (let l = 0; l < texto.length; l++) {
        const letra = LETRAS[texto[l]];
        for (let f = 0; f < ALTO; f++) {
            for (let c = 0; c < ANCHO; c++) {
                if (letra[f][c] !== '#') continue;
                for (let dy = 0; dy < g.escala; dy++) {
                    for (let dx = 0; dx < g.escala; dx++) {
                        pintar(g.xInicial + (l * (ANCHO + g.separacion) + c) * g.escala + dx,
                            g.yInicial + f * g.escala + dy, blanco);
                    }
                }
            }
        }
    }

    return px;
}

// Arma el logo en SVG (letras dibujadas con rectángulos, sin depender de fuentes)
function crearSvg(tam) {
    const g = geometriaTexto(tam);
    const lado = tam - 2 * g.margen;
    let rects = '';

    for (let l = 0; l < 'SQL'.length; l++) {
        const letra = LETRAS['SQL'[l]];
        for (let f = 0; f < ALTO; f++) {
            for (let c = 0; c < ANCHO; c++) {
                if (letra[f][c] !== '#') continue;
                const x = g.xInicial + (l * (ANCHO + g.separacion) + c) * g.escala;
                const y = g.yInicial + f * g.escala;
                rects += `<rect x="${x}" y="${y}" width="${g.escala}" height="${g.escala}"/>`;
            }
        }
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" role="img" aria-label="SQL Alumnos">
  <rect x="${g.margen}" y="${g.margen}" width="${lado}" height="${lado}" rx="${Math.round(tam * 0.1)}" fill="${COLOR_FONDO}" stroke="${COLOR_BORDE}" stroke-width="${g.grosor}"/>
  <g fill="${COLOR_TEXTO}">${rects}</g>
</svg>
`;
}

// Codifica los pixeles como PNG (RGBA, sin filtros)
function codificarPng(px, tam) {
    const crcTabla = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        crcTabla[n] = c >>> 0;
    }
    const crc = (buf) => {
        let c = 0xFFFFFFFF;
        for (const b of buf) c = crcTabla[(c ^ b) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    };
    const trozo = (tipo, datos) => {
        const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length, 0);
        const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
        const c = Buffer.alloc(4); c.writeUInt32BE(crc(cuerpo), 0);
        return Buffer.concat([largo, cuerpo, c]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(tam, 0); ihdr.writeUInt32BE(tam, 4);
    ihdr[8] = 8; ihdr[9] = 6;

    const datos = Buffer.alloc(tam * (tam * 4 + 1));
    for (let y = 0; y < tam; y++) {
        datos[y * (tam * 4 + 1)] = 0;
        px.copy(datos, y * (tam * 4 + 1) + 1, y * tam * 4, (y + 1) * tam * 4);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        trozo('IHDR', ihdr),
        trozo('IDAT', zlib.deflateSync(datos, { level: 9 })),
        trozo('IEND', Buffer.alloc(0))
    ]);
}

// Arma el archivo ICO
function construirIco(tamanos) {
    const imagenes = tamanos.map(t => ({ tam: t, datos: codificarPng(dibujar(t), t) }));
    const cabecera = Buffer.alloc(6 + 16 * imagenes.length);
    cabecera.writeUInt16LE(0, 0);
    cabecera.writeUInt16LE(1, 2);
    cabecera.writeUInt16LE(imagenes.length, 4);

    let offset = cabecera.length;
    imagenes.forEach((im, i) => {
        const p = 6 + 16 * i;
        cabecera[p] = im.tam >= 256 ? 0 : im.tam;
        cabecera[p + 1] = im.tam >= 256 ? 0 : im.tam;
        cabecera.writeUInt16LE(1, p + 4);
        cabecera.writeUInt16LE(32, p + 6);
        cabecera.writeUInt32LE(im.datos.length, p + 8);
        cabecera.writeUInt32LE(offset, p + 12);
        offset += im.datos.length;
    });

    return Buffer.concat([cabecera, ...imagenes.map(i => i.datos)]);
}

// === Genera los tres archivos ===
const ico = construirIco([16, 32, 48, 64, 128, 256]);
const rutaIco = path.join(__dirname, 'sqlalumnos.ico');
fs.writeFileSync(rutaIco, ico);

const publico = path.join(__dirname, '..', 'src', 'main', 'resources', 'public');
const rutaFavicon = path.join(publico, 'favicon.ico');
fs.writeFileSync(rutaFavicon, ico);

const rutaSvg = path.join(publico, 'logo.svg');
fs.writeFileSync(rutaSvg, crearSvg(256), 'utf8');

console.log('Icono del ejecutable:', rutaIco, fs.statSync(rutaIco).size, 'bytes');
console.log('Favicon de la pestaña:', rutaFavicon, fs.statSync(rutaFavicon).size, 'bytes');
console.log('Logo del header:', rutaSvg, fs.statSync(rutaSvg).size, 'bytes');