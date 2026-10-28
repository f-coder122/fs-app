/**
 * build.js — Fahrschul App
 * Copies all web assets into www/ (Capacitor) and public/ (Vercel).
 * Run: node build.js
 */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const DESTINATIONS = ['www', 'public'].map(folder => path.join(__dirname, folder));

// Files to copy to www/
const FILES = [
  'index.html',
  'app.js',
  'auth.js',
  'questions_data.js',
  'questions.json',
  'favicon.ico',
];

// Folders to copy recursively
const FOLDERS = [
  'Fragen',
];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      copyFile(s, d);
    }
  }
}

for (const destRoot of DESTINATIONS) {
  fs.mkdirSync(destRoot, { recursive: true });
  console.log(`Building ${path.basename(destRoot)}/...`);

  for (const file of FILES) {
    const src = path.join(SRC, file);
    const dest = path.join(destRoot, file);
    if (fs.existsSync(src)) {
      copyFile(src, dest);
      console.log(`  ✓ ${file}`);
    } else {
      console.warn(`  ⚠ Skipped (not found): ${file}`);
    }
  }

  for (const folder of FOLDERS) {
    const src = path.join(SRC, folder);
    const dest = path.join(destRoot, folder);
    copyDir(src, dest);
    console.log(`  ✓ ${folder}/`);
  }
}

console.log('Done! www/ is ready for Capacitor and public/ for Vercel.');
