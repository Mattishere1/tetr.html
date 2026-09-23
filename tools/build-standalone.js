#!/usr/bin/env node
/**
 * Build the original Tetr.js UI/game into one HTML file without audio.
 * The generated game is the existing game; this does not replace it with a
 * simplified implementation.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = process.argv[2] || 'standalone.html';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const gameScripts = [
  'tetr_js/bigmin.js',
  'tetr_js/tetris.js',
  'tetr_js/piece.js',
  'tetr_js/stack.js',
  'tetr_js/hold.js',
  'tetr_js/preview.js',
  'tetr_js/menu.js',
  'tetr_js/bg.js',
  'tetr_js/ranking.js',
  'tetr_js/compress.js',
  'tetr_js/touch.js',
];

function skipQuoted(source, start, quote) {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') i++;
    else if (source[i] === quote) return i + 1;
  }
  return source.length;
}

function skipComment(source, start) {
  if (source.startsWith('//', start)) {
    const end = source.indexOf('\n', start + 2);
    return end < 0 ? source.length : end;
  }
  const end = source.indexOf('*/', start + 2);
  return end < 0 ? source.length : end + 2;
}

// Remove a JavaScript call such as sound.playse("rotate") without using a
// broad multiline regexp that could accidentally delete game logic.
function removeAudioCalls(source) {
  let result = '';
  let cursor = 0;
  const call = /\bsound\s*\.\s*[A-Za-z_$][\w$]*\s*\(/g;
  let match;

  while ((match = call.exec(source))) {
    const open = source.indexOf('(', match.index);
    let depth = 0;
    let end = open;
    for (; end < source.length; end++) {
      const c = source[end];
      if (c === '"' || c === "'" || c === '`') {
        end = skipQuoted(source, end, c) - 1;
      } else if (c === '/' && source[end + 1] === '/') {
        end = skipComment(source, end) - 1;
      } else if (c === '/' && source[end + 1] === '*') {
        end = skipComment(source, end) - 1;
      } else if (c === '(') {
        depth++;
      } else if (c === ')' && --depth === 0) {
        end++;
        if (source[end] === ';') end++;
        break;
      }
    }
    result += source.slice(cursor, match.index);
    // Preserve line numbers and surrounding syntax as much as possible.
    result += source.slice(match.index, end).replace(/[^\n]/g, ' ');
    cursor = end;
    call.lastIndex = end;
  }
  return result + source.slice(cursor);
}

function prepareScript(file) {
  let source = read(file);
  source = removeAudioCalls(source);
  if (/\bsound\s*\./.test(source)) {
    throw new Error(`Audio reference remained in ${file}`);
  }
  return `<script>\n/* ${file} — audio calls removed */\n${source}\n</script>`;
}

function replaceExternalScript(html, file, replacement) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<script\\b[^>]*\\bsrc=["']${escaped}["'][^>]*>\\s*</script>`, 'g');
  const next = html.replace(pattern, replacement);
  if (next === html) throw new Error(`Could not locate script tag for ${file}`);
  return next;
}

let html = read('index.html');
for (const file of gameScripts) html = replaceExternalScript(html, file, prepareScript(file));

// These are the only script tags that must not be copied into the output.
for (const file of ['tetr_js/howler.core.js', 'tetr_js/sound.js']) {
  html = replaceExternalScript(html, file, '<!-- audio module intentionally omitted -->');
}

// Cookies are local persistence, not audio. Keep the game’s existing cookie
// API while making it work when the file is opened directly from disk.
html = replaceExternalScript(html, 'npm/js-cookie-2/src/js.cookie.min.js', `<script>
window.Cookies = window.Cookies || {
  get(key) { return localStorage.getItem('tetr-cookie:' + key) ?? undefined; },
  set(key, value) { localStorage.setItem('tetr-cookie:' + key, String(value)); },
  remove(key) { localStorage.removeItem('tetr-cookie:' + key); }
};
</script>`);

fs.writeFileSync(path.join(root, output), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`Wrote ${output} (${kb} KiB); original game preserved; audio modules and calls omitted.`);
