/**
 * auth.js — Fahrschul App
 * Online-Konten über Supabase: Jeder Nutzer hat eigenen Fehlerspeicher,
 * Merkliste, Lernfortschritt und Prüfungsverlauf – auf jedem Gerät gleich.
 * Lädt app.js erst, wenn der Lernstand des Nutzers geholt wurde.
 *
 * Der Browser-Speicher dient nur als Zwischenspeicher (auch offline nutzbar);
 * jede Änderung wird automatisch zu Supabase hochgeladen.
 */
(function () {
    'use strict';

    // Öffentliche Projektdaten (der "publishable"-Schlüssel darf im Browser stehen,
    // der Zugriff auf die Daten ist per Row Level Security auf den eigenen Nutzer beschränkt)
    const SUPABASE_URL = 'https://kzavvlwaoimczmopmcua.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_-mwZ5GLP2KiUX0vz2zzwkw_TUUTbWOB';

    // Benutzernamen werden intern auf eine Platzhalter-Adresse abgebildet (es werden keine E-Mails verschickt)
    const EMAIL_DOMAIN = 'fs-app.example.com';
    const MAIN_USER = 'flo';
    const DATA_KEYS = [
        'fahrschule_errors',
        'fahrschule_exam_history',
        'fahrschule_favorites',
        'fahrschule_learned'
    ];
    const PUSH_DELAY_MS = 1500;
    const DEVICE_MERGED_KEY = 'fs_device_merged_';

    const client = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
    let currentUser = null;
    let userId = null;
    let pushTimer = null;

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

    function userDataKey(user, key) {
        return 'fs_u_' + encodeURIComponent(user) + '__' + key;
    }

    function nameFromSession(session) {
        const meta = session.user.user_metadata || {};
        return meta.username || session.user.email.split('@')[0];
    }

    function setStatus(text) {
        const el = document.getElementById('sync-status');
        if (el) el.textContent = text;
    }

    // ---------- Abgleich mit Supabase ----------
    function collectLocal() {
        const data = {};
        DATA_KEYS.forEach(key => { data[key] = readJSON(userDataKey(currentUser, key), []); });
        return data;
    }

    function hasAnyData(data) {
        return DATA_KEYS.some(key => Array.isArray(data[key]) && data[key].length);
    }

    async function pushNow() {
        clearTimeout(pushTimer);
        pushTimer = null;
        if (!userId) return;
        setStatus('Speichert…');
        const { error } = await client.from('progress').upsert({
            user_id: userId,
            data: collectLocal(),
            updated_at: new Date().toISOString()
        });
        setStatus(error ? 'Offline – lokal gespeichert' : 'Gespeichert ✓');
        if (error) console.error('Speichern fehlgeschlagen', error);
    }

    function schedulePush() {
        clearTimeout(pushTimer);
        pushTimer = setTimeout(pushNow, PUSH_DELAY_MS);
    }

    async function pullRemote() {
        const { data: row, error } = await client.from('progress').select('data').eq('user_id', userId).maybeSingle();
        if (error) {
            console.error('Laden fehlgeschlagen', error);
            setStatus('Offline – lokaler Stand');
            return;
        }
        const remote = (row && row.data) || {};
        const mergedFlag = DEVICE_MERGED_KEY + encodeURIComponent(currentUser);
        if (!localStorage.getItem(mergedFlag)) {
            // Erste Anmeldung auf diesem Gerät: bisherigen Stand des Geräts mit dem Online-Stand zusammenführen
            const local = collectLocal();
            DATA_KEYS.forEach(key => {
                let list = mergeLists(remote[key], local[key]);
                // Daten aus der Zeit vor den Konten gehören dem Hauptnutzer
                if (currentUser === MAIN_USER) list = mergeLists(list, readJSON(key, []));
                localStorage.setItem(userDataKey(currentUser, key), JSON.stringify(list));
            });
            if (hasAnyData(collectLocal())) await pushNow();
            else setStatus('Synchronisiert ✓');
            localStorage.setItem(mergedFlag, new Date().toISOString());
            return;
        }
        DATA_KEYS.forEach(key => {
            localStorage.setItem(userDataKey(currentUser, key), JSON.stringify(remote[key] || []));
        });
        setStatus('Synchronisiert ✓');
    }

    // Jede Änderung von app.js an den Daten des Nutzers automatisch hochladen
    function watchLocalChanges() {
        const prefix = userDataKey(currentUser, '');
        const origSet = Storage.prototype.setItem;
        const origRemove = Storage.prototype.removeItem;
        Storage.prototype.setItem = function (key, value) {
            origSet.call(this, key, value);
            if (this === localStorage && String(key).startsWith(prefix)) schedulePush();
        };
        Storage.prototype.removeItem = function (key) {
            origRemove.call(this, key);
            if (this === localStorage && String(key).startsWith(prefix)) schedulePush();
        };
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && pushTimer) pushNow();
        });
    }

    // ---------- Anmelden / Registrieren ----------
    function toEmail(user) {
        return user + '@' + EMAIL_DOMAIN;
    }

    async function login(name, password) {
        const user = normalizeName(name);
        const { error } = await client.auth.signInWithPassword({ email: toEmail(user), password });
        if (error) return 'Benutzername oder Passwort ist falsch.';
        location.reload();
        return null;
    }

    async function register(name, password, password2) {
        const user = normalizeName(name);
        if (!/^[a-z0-9_.\-]{3,30}$/.test(user)) {
            return 'Benutzername: 3–30 Zeichen (Buchstaben a–z, Ziffern, . _ -).';
        }
        if (String(password).length < 6) return 'Das Passwort muss mindestens 6 Zeichen haben.';
        if (password !== password2) return 'Die Passwörter stimmen nicht überein.';
        const { data, error } = await client.auth.signUp({
            email: toEmail(user),
            password,
            options: { data: { username: user } }
        });
        if (error) {
            return /registered|exists/i.test(error.message)
                ? 'Diesen Benutzernamen gibt es schon.'
                : 'Registrierung fehlgeschlagen: ' + error.message;
        }
        if (!data.session) return 'Konto erstellt, aber Anmeldung nicht möglich. Bitte später erneut versuchen.';
        location.reload();
        return null;
    }

    async function logout() {
        if (pushTimer) await pushNow();
        await client.auth.signOut();
        location.reload();
    }

    // ---------- Daten sichern / laden (Datei) ----------
    function exportData() {
        const payload = { app: 'fs-app', version: 1, user: currentUser, exported: new Date().toISOString(), data: collectLocal() };
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

    // Akzeptiert eine Datei von "Sichern" oder einen kompletten localStorage-Abzug der alten Seite
    function extractImport(obj) {
        if (obj && obj.app === 'fs-app' && obj.data) return obj.data;
        const result = {};
        DATA_KEYS.forEach(key => {
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
        reader.onload = async () => {
            let imported;
            try {
                imported = extractImport(JSON.parse(reader.result));
            } catch (e) {
                alert('Die Datei konnte nicht gelesen werden.');
                return;
            }
            const keys = DATA_KEYS.filter(key => Array.isArray(imported[key]));
            if (!keys.length) {
                alert('In der Datei wurden keine Lerndaten gefunden.');
                return;
            }
            keys.forEach(key => {
                const target = userDataKey(currentUser, key);
                localStorage.setItem(target, JSON.stringify(mergeLists(readJSON(target, []), imported[key])));
            });
            await pushNow();
            alert('Daten wurden in das Konto "' + currentUser + '" übernommen.');
            location.reload();
        };
        reader.readAsText(file);
    }

    // ---------- Oberfläche ----------
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function buildModal() {
        if (document.getElementById('auth-modal')) return;
        const wrap = document.createElement('div');
        wrap.id = 'auth-modal';
        wrap.className = 'fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4';
        // Grundlayout auch ohne Tailwind (z. B. offline) sicherstellen
        wrap.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(15,23,42,.7);';
        wrap.innerHTML = `
          <div class="bg-white w-full max-w-sm rounded-2xl shadow-xl p-6" style="background:#fff;width:100%;max-width:24rem;border-radius:1rem;padding:1.5rem;">
            <h2 class="text-xl font-extrabold mb-1"><span class="text-red-600">CT</span>Online <span class="text-slate-400 text-sm font-normal">Privat</span></h2>
            <p id="auth-subtitle" class="text-sm text-slate-500 mb-5">Bitte melde dich an – dein Lernstand ist auf jedem Gerät gleich.</p>
            <form id="auth-form" class="space-y-3" autocomplete="on">
              <input id="auth-user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Benutzername" required
                     class="w-full border border-slate-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-red-500">
              <input id="auth-pass" name="password" type="password" autocomplete="current-password" placeholder="Passwort" required
                     class="w-full border border-slate-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-red-500">
              <input id="auth-pass2" type="password" autocomplete="new-password" placeholder="Passwort wiederholen"
                     class="hidden w-full border border-slate-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-red-500">
              <p id="auth-error" class="hidden text-sm text-red-600"></p>
              <button id="auth-submit" type="submit" class="w-full bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg py-2.5 transition disabled:opacity-60">Anmelden</button>
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
                : 'Bitte melde dich an – dein Lernstand ist auf jedem Gerät gleich.';
            showError('');
        });
        $('auth-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            $('auth-submit').disabled = true;
            showError('');
            const err = mode === 'login'
                ? await login($('auth-user').value, $('auth-pass').value)
                : await register($('auth-user').value, $('auth-pass').value, $('auth-pass2').value);
            showError(err);
            $('auth-submit').disabled = false;
        });
        setTimeout(() => $('auth-user').focus(), 50);
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

    function startApp() {
        const script = document.createElement('script');
        script.src = 'app.js';
        document.body.appendChild(script);
    }

    // ---------- Schnittstelle für app.js ----------
    window.FSAuth = {
        get user() { return currentUser; },
        key(baseKey) {
            return userDataKey(currentUser || '__gast__', baseKey);
        },
        escapeHtml
    };

    async function init() {
        try {
            if (!client) throw new Error('Supabase-Bibliothek nicht geladen');
            const { data } = await client.auth.getSession();
            if (data.session) {
                currentUser = nameFromSession(data.session);
                userId = data.session.user.id;
                setStatus('Lädt…');
                await pullRemote();
                watchLocalChanges();
            }
        } catch (e) {
            console.error('Anmeldung: Supabase nicht erreichbar', e);
            setStatus('Offline');
        }
        renderUserBar();
        startApp();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
