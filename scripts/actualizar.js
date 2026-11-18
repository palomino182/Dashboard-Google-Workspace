// Regenera docs/index.html (diseño, datos o código nuevos) SIN cambiar el usuario ni la clave.
//
// Uso:   node scripts/actualizar.js
// Pide el usuario y la clave actuales y los comprueba contra docs/index.html. Si no coinciden,
// no genera nada. Si coinciden, vuelve a cifrar con la misma clave.
// Para CAMBIAR la clave usa scripts/publicar.js.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const RAIZ = path.join(__dirname, '..');
const DOCS = path.join(RAIZ, 'docs', 'index.html');

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

function leerPayload(html) {
  const m = html.match(/<script id="payload" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('No encontré el bloque cifrado en docs/index.html.');
  return JSON.parse(m[1]);
}

async function main() {
  if (!fs.existsSync(DOCS)) {
    console.error('No existe docs/index.html. La primera vez usa: node scripts/publicar.js');
    process.exit(1);
  }
  const actual = leerPayload(fs.readFileSync(DOCS, 'utf8'));

  let usuario = process.env.PAGES_USUARIO;
  let clave = process.env.PAGES_CLAVE;
  if (!usuario || !clave) {
    if (!process.stdin.isTTY) {
      console.error('Esta terminal no permite escribir la clave de forma oculta. Ejecútalo desde PowerShell o la terminal de VS Code.');
      process.exit(1);
    }
    usuario = (await preguntar('Usuario actual: ', false)).trim();
    clave = await preguntar('Clave actual: ', true);
  }

  // Misma sal e iteraciones que la versión publicada => misma clave de cifrado
  const salt = Buffer.from(actual.salt, 'base64');
  const key = crypto.pbkdf2Sync(usuario.trim().toLowerCase() + '\n' + clave, salt, actual.iter, 32, 'sha256');

  // Comprobación: la clave debe abrir la versión publicada
  try {
    const ct = Buffer.from(actual.ct, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(actual.iv, 'base64'));
    d.setAuthTag(ct.subarray(ct.length - 16));
    Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  } catch (e) {
    console.error('Usuario o clave incorrectos: no coinciden con la versión publicada. No se generó nada.');
    process.exit(1);
  }

  const html = fs.readFileSync(path.join(RAIZ, 'dashboard', 'index.html'), 'utf8');
  const pdf = fs.readFileSync(path.join(RAIZ, 'dashboard', 'pdf.js'), 'utf8');
  const rows = JSON.parse(fs.readFileSync(path.join(RAIZ, 'resultados', 'dashboard_cuentas.json'), 'utf8')).rows;
  const plantilla = fs.readFileSync(path.join(__dirname, 'plantilla-pages.html'), 'utf8');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plano = Buffer.from(JSON.stringify({html, pdf, rows}), 'utf8');
  const ct = Buffer.concat([cipher.update(plano), cipher.final(), cipher.getAuthTag()]);
  const payload = JSON.stringify({v: 1, iter: actual.iter, salt: actual.salt, iv: iv.toString('base64'), ct: ct.toString('base64')});

  fs.writeFileSync(DOCS, plantilla.replace('/*__PAYLOAD__*/', () => payload));
  console.log(`Listo: docs/index.html actualizado con la misma clave (${rows.length} cuentas).`);
  console.log('Ahora: git add docs scripts  ->  git commit -m "Actualiza dashboard"  ->  git push');
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
