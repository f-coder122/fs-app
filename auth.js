/**
 * auth.js — Fahrschul App
 * Einfache Benutzeranmeldung: Jeder Nutzer hat eigenen Fehlerspeicher,
 * Merkliste, Lernfortschritt und Prüfungsverlauf (gespeichert im Browser).
 * Muss VOR app.js geladen werden.
 *
 * Hinweis: Die Anmeldung läuft komplett im Browser (kein Server).
 * Sie trennt die Daten der Nutzer, ist aber kein Schutz vor technisch
 * versierten Personen mit Zugriff auf dasselbe Gerät.
 */
(function () {
    'use strict';

    const USERS_KEY = 'fs_users';
    const CURRENT_KEY = 'fs_current_user';
    const MIGRATED_KEY = 'fs_migrated_to_main_user_v1';
    const MAIN_USER = 'flo';
    // Hauptnutzer: Passwort wird nur als gesalzener SHA-256-Hash gespeichert
    const MAIN_USER_RECORD = {
        salt: 'fsapp-flo-7c1e',
        hash: '1e51577e345a5df70f12cac1dd2f9ffa961f7f7eef96170eb342e7b816b4931c',
        main: true
    };
    // Bisherige (gemeinsame) Speicher-Schlüssel der App
    const LEGACY_KEYS = [
        'fahrschule_errors',
        'fahrschule_exam_history',
        'fahrschule_favorites',
        'fahrschule_learned'
    ];

    // ---------- SHA-256 (reines JS, funktioniert auch ohne HTTPS) ----------
    function sha256(ascii) {
        const utf8 = unescape(encodeURIComponent(ascii));
        const K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        const bytes = [];
        for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
        const bitLen = bytes.length * 8;
        bytes.push(0x80);
        while (bytes.length % 64 !== 56) bytes.push(0);
        const hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
        bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
                   (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
        const rotr = (x, n) => (x >>> n) | (x << (32 - n));
        const W = new Array(64);
        for (let off = 0; off < bytes.length; off += 64) {
            for (let t = 0; t < 16; t++) {
                const j = off + t * 4;
                W[t] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
            }
            for (let t = 16; t < 64; t++) {
                const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
                const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
                W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
            }
            let [a, b, c, d, e, f, g, h] = H;
            for (let t = 0; t < 64; t++) {
                const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                const ch = (e & f) ^ (~e & g);
                const T1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
                const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const T2 = (S0 + maj) >>> 0;
                h = g; g = f; f = e; e = (d + T1) >>> 0;
                d = c; c = b; b = a; a = (T1 + T2) >>> 0;
            }
            H = [a, b, c, d, e, f, g, h].map((v, i) => (H[i] + v) >>> 0);
        }
        return H.map(v => v.toString(16).padStart(8, '0')).join('');
    }

    // ---------- Speicher-Helfer ----------
    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function normalizeName(name) {
        return String(name || '').trim().toLowerCase();
    }

    function loadUsers() {
        const users = readJSON(USERS_KEY, {});
        if (!users[MAIN_USER]) {
            users[MAIN_USER] = Object.assign({}, MAIN_USER_RECORD);
            localStorage.setItem(USERS_KEY, JSON.stringify(users));
        }
        return users;
    }

    function userDataKey(user, key) {
        return 'fs_u_' + encodeURIComponent(user) + '__' + key;
    }

    // Bisherige Daten einmalig dem Hauptnutzer "flo" zuordnen
    function migrateLegacyData() {
        if (localStorage.getItem(MIGRATED_KEY)) return;
        LEGACY_KEYS.forEach(key => {
            const value = localStorage.getItem(key);
            const target = userDataKey(MAIN_USER, key);
            if (value !== null && localStorage.getItem(target) === null) {
                localStorage.setItem(target, value);
            }
        });
        localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
    }

    let users = {};
    let currentUser = null;
    try {
        users = loadUsers();
        migrateLegacyData();
        const saved = normalizeName(localStorage.getItem(CURRENT_KEY));
        currentUser = saved && users[saved] ? saved : null;
    } catch (e) {
        console.error('Anmeldung: Browser-Speicher nicht verfügbar', e);
    }

    function makeSalt() {
        let s = '';
        for (let i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
        return s;
    }

    function login(name, password) {
        const user = normalizeName(name);
        const rec = users[user];
        if (!rec || sha256(rec.salt + ':' + password) !== rec.hash) {
            return 'Benutzername oder Passwort ist falsch.';
        }
        localStorage.setItem(CURRENT_KEY, user);
        location.reload();
        return null;
    }

    function register(name, password, password2) {
        const user = normalizeName(name);
        if (!/^[a-z0-9_.\-äöüß]{3,30}$/.test(user)) {
            return 'Benutzername: 3–30 Zeichen (Buchstaben, Ziffern, . _ -).';
        }
        if (users[user]) return 'Diesen Benutzernamen gibt es schon.';
        if (String(password).length < 4) return 'Das Passwort muss mindestens 4 Zeichen haben.';
        if (password !== password2) return 'Die Passwörter stimmen nicht überein.';
        const salt = makeSalt();
        users[user] = { salt, hash: sha256(salt + ':' + password), created: new Date().toISOString() };
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        localStorage.setItem(CURRENT_KEY, user);
        location.reload();
        return null;
    }

    function logout() {
        localStorage.removeItem(CURRENT_KEY);
        location.reload();
    }

    // ---------- Oberfläche ----------
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function buildModal() {
        const wrap = document.createElement('div');
        wrap.id = 'auth-modal';
        wrap.className = 'fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4';
        // Grundlayout auch ohne Tailwind (z. B. offline) sicherstellen
        wrap.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(15,23,42,.7);';
        wrap.innerHTML = `
          <div class="bg-white w-full max-w-sm rounded-2xl shadow-xl p-6" style="background:#fff;width:100%;max-width:24rem;border-radius:1rem;padding:1.5rem;">
            <h2 class="text-xl font-extrabold mb-1"><span class="text-red-600">CT</span>Online <span class="text-slate-400 text-sm font-normal">Privat</span></h2>
            <p id="auth-subtitle" class="text-sm text-slate-500 mb-5">Bitte melde dich an, damit dein Lernstand gespeichert wird.</p>
            <form id="auth-form" class="space-y-3" autocomplete="on">
              <input id="auth-user" name="username" autocomplete="username" placeholder="Benutzername" required
                     class="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500">
              <input id="auth-pass" name="password" type="password" autocomplete="current-password" placeholder="Passwort" required
                     class="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500">
              <input id="auth-pass2" type="password" autocomplete="new-password" placeholder="Passwort wiederholen"
                     class="hidden w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500">
              <p id="auth-error" class="hidden text-sm text-red-600"></p>
              <button id="auth-submit" type="submit" class="w-full bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg py-2 transition">Anmelden</button>
            </form>
            <button id="auth-toggle" type="button" class="mt-4 w-full text-sm text-slate-500 hover:text-red-600 transition">Noch kein Konto? Neu registrieren</button>
          </div>`;
        document.body.appendChild(wrap);

        let mode = 'login';
        const $ = id => document.getElementById(id);
        const showError = msg => {
            $('auth-error').textContent = msg || '';
            $('auth-error').classList.toggle('hidden', !msg);
        };
        $('auth-toggle').addEventListener('click', () => {
            mode = mode === 'login' ? 'register' : 'login';
            const reg = mode === 'register';
            $('auth-pass2').classList.toggle('hidden', !reg);
            $('auth-pass2').required = reg;
            $('auth-pass').setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
            $('auth-submit').textContent = reg ? 'Konto erstellen' : 'Anmelden';
            $('auth-toggle').textContent = reg ? 'Schon ein Konto? Anmelden' : 'Noch kein Konto? Neu registrieren';
            $('auth-subtitle').textContent = reg
                ? 'Neues Konto anlegen – dein Lernstand wird getrennt gespeichert.'
                : 'Bitte melde dich an, damit dein Lernstand gespeichert wird.';
            showError('');
        });
        $('auth-form').addEventListener('submit', (event) => {
            event.preventDefault();
            const err = mode === 'login'
                ? login($('auth-user').value, $('auth-pass').value)
                : register($('auth-user').value, $('auth-pass').value, $('auth-pass2').value);
            showError(err);
        });
        setTimeout(() => $('auth-user').focus(), 50);
    }

    // ---------- Daten sichern / laden (z. B. beim Umzug auf eine neue Adresse) ----------
    function exportData() {
        const data = {};
        LEGACY_KEYS.forEach(key => { data[key] = readJSON(userDataKey(currentUser, key), []); });
        const payload = { app: 'fs-app', version: 1, user: currentUser, exported: new Date().toISOString(), data };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'fs-app-' + currentUser + '-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    function parseValue(value) {
        if (typeof value !== 'string') return value;
        try { return JSON.parse(value); } catch (e) { return null; }
    }

    // Akzeptiert eine Datei von "Daten sichern" oder einen kompletten localStorage-Abzug der alten Seite
    function extractImport(obj) {
        if (obj && obj.app === 'fs-app' && obj.data) return obj.data;
        const result = {};
        LEGACY_KEYS.forEach(key => {
            const candidates = [userDataKey(currentUser, key), key, userDataKey(MAIN_USER, key)];
            const found = candidates.find(k => obj[k] !== undefined && obj[k] !== null);
            if (found) result[key] = parseValue(obj[found]);
        });
        return result;
    }

    function mergeLists(oldList, newList) {
        const seen = new Set();
        return [].concat(oldList || [], newList || []).filter(item => {
            const id = JSON.stringify(item);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = () => {
            let imported;
            try {
                imported = extractImport(JSON.parse(reader.result));
            } catch (e) {
                alert('Die Datei konnte nicht gelesen werden.');
                return;
            }
            const keys = LEGACY_KEYS.filter(key => Array.isArray(imported[key]));
            if (!keys.length) {
                alert('In der Datei wurden keine Lerndaten gefunden.');
                return;
            }
            keys.forEach(key => {
                const target = userDataKey(currentUser, key);
                localStorage.setItem(target, JSON.stringify(mergeLists(readJSON(target, []), imported[key])));
            });
            alert('Daten wurden in das Konto "' + currentUser + '" übernommen.');
            location.reload();
        };
        reader.readAsText(file);
    }

    function renderUserBar() {
        const nameEl = document.getElementById('current-user-name');
        const btn = document.getElementById('btn-auth');
        if (nameEl) nameEl.textContent = currentUser ? currentUser : 'Nicht angemeldet';
        if (btn) {
            btn.textContent = currentUser ? 'Abmelden' : 'Anmelden';
            btn.addEventListener('click', () => (currentUser ? logout() : buildModal()));
        }
        const exportBtn = document.getElementById('btn-export');
        const importBtn = document.getElementById('btn-import');
        const fileInput = document.getElementById('import-file');
        if (currentUser && exportBtn && importBtn && fileInput) {
            exportBtn.classList.remove('hidden');
            importBtn.classList.remove('hidden');
            exportBtn.addEventListener('click', exportData);
            importBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', () => {
                if (fileInput.files[0]) importData(fileInput.files[0]);
                fileInput.value = '';
            });
        }
        if (!currentUser) buildModal();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderUserBar);
    } else {
        renderUserBar();
    }

    // ---------- Schnittstelle für app.js ----------
    window.FSAuth = {
        get user() { return currentUser; },
        key(baseKey) {
            return userDataKey(currentUser || '__gast__', baseKey);
        },
        escapeHtml
    };
})();
