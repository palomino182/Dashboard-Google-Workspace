// Genera docs/ para GitHub Pages: una página con login cuyo contenido (dashboard, datos y código) va cifrado.
//
// Uso:   node scripts/publicar.js  [--tema=consola|moderno]
// Pide el usuario y la clave en la terminal. Para cambiar la clave o publicar datos nuevos, vuelve a ejecutarlo
// (primero regenera los datos con: node scripts/analizar.js data/<exportación>.json).
//
// Cifrado: PBKDF2-SHA256 (600.000 iteraciones) sobre "usuario\nclave" -> clave AES-256-GCM.
// Sin el usuario y la clave correctos el archivo publicado no revela nada.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

// Tema visual: --tema=consola | --tema=moderno (por defecto, el de scripts/temas/actual.txt)
function leerTema() {
  const arg = process.argv.find((a) => a.startsWith('--tema='));
  const dir = path.join(__dirname, 'temas');
  const nombre = (arg ? arg.slice(7) : fs.readFileSync(path.join(dir, 'actual.txt'), 'utf8')).trim();
  const f = path.join(dir, nombre + '.html');
  if (!/^[a-z0-9-]+$/i.test(nombre) || !fs.existsSync(f)) {
    const hay = fs.readdirSync(dir).filter((x) => x.endsWith('.html')).map((x) => x.slice(0, -5)).join(', ');
    console.error('Tema desconocido: ' + nombre + '. Disponibles: ' + hay);
    process.exit(1);
  }
  if (arg) fs.writeFileSync(path.join(dir, 'actual.txt'), nombre + '\n');
  return {nombre, css: fs.readFileSync(f, 'utf8')};
}

const RAIZ = path.join(__dirname, '..');
const ITER = 600000;
const MIN_CLAVE = 12;

function preguntar(texto, oculto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({input: process.stdin, output: process.stdout, terminal: true});
    if (oculto) {
      rl._writeToOutput = function (s) {
        if (s.includes(texto)) rl.output.write(s); else if (s === '\r\n' || s === '\n') rl.output.write(s); else rl.output.write('*');
      };
    }
    rl.question(texto, (r) => { rl.close(); if (oculto) process.stdout.write('\n'); resolve(r); });
  });
}

async function main() {
  const html = fs.readFileSync(path.join(RAIZ, 'dashboard', 'index.html'), 'utf8');
  const pdf = fs.readFileSync(path.join(RAIZ, 'dashboard', 'pdf.js'), 'utf8');
  const rows = JSON.parse(fs.readFileSync(path.join(RAIZ, 'resultados', 'dashboard_cuentas.json'), 'utf8')).rows;
  const plantilla = fs.readFileSync(path.join(__dirname, 'plantilla-pages.html'), 'utf8');

  let usuario = process.env.PAGES_USUARIO;
  let clave = process.env.PAGES_CLAVE;
  if (!usuario || !clave) {
    if (!process.stdin.isTTY) {
      console.error('Esta terminal no permite escribir la clave de forma oculta. Ejecútalo desde PowerShell o la terminal de VS Code.');
      process.exit(1);
    }
    usuario = (await preguntar('Usuario: ', false)).trim();
    clave = await preguntar('Clave: ', true);
    const clave2 = await preguntar('Repite la clave: ', true);
    if (clave !== clave2) { console.error('Las claves no coinciden. No se generó nada.'); process.exit(1); }
  }
  if (!usuario) { console.error('El usuario no puede estar vacío.'); process.exit(1); }
  if (clave.length < MIN_CLAVE) {
    console.error(`La clave debe tener al menos ${MIN_CLAVE} caracteres. El archivo cifrado es público y una clave corta se puede adivinar probando combinaciones.`);
    console.error('Sugerencia: una frase de varias palabras, por ejemplo "rio-azul-camion-2026-norte".');
    process.exit(1);
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(usuario.trim().toLowerCase() + '\n' + clave, salt, ITER, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plano = Buffer.from(JSON.stringify({html, pdf, rows}), 'utf8');
  const ct = Buffer.concat([cipher.update(plano), cipher.final(), cipher.getAuthTag()]);
  const payload = JSON.stringify({v: 1, iter: ITER, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64')});

  const docs = path.join(RAIZ, 'docs');
  fs.mkdirSync(docs, {recursive: true});
  const tema = leerTema();
  fs.writeFileSync(path.join(docs, 'index.html'), plantilla.replace('<!--__TEMA__-->', () => tema.css).replace('/*__PAYLOAD__*/', () => payload));
  console.log('Tema: ' + tema.nombre);
  fs.writeFileSync(path.join(docs, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(docs, '.nojekyll'), '');

  console.log(`Listo: docs/index.html (${rows.length} cuentas, ${(payload.length / 1024).toFixed(0)} KB cifrados).`);
  console.log('Sube la carpeta docs/ a GitHub y comparte el usuario y la clave por un canal distinto al enlace.');
}

main().catch((e) => { console.error(e); process.exit(1); });
