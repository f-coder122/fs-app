// App State (Daten werden pro angemeldetem Nutzer gespeichert, siehe auth.js)
let allQuestions = [];
let currentQuestions = [];
let currentIndex = 0;
let errorLog = JSON.parse(localStorage.getItem(FSAuth.key('fahrschule_errors'))) || [];
let examHistory = JSON.parse(localStorage.getItem(FSAuth.key('fahrschule_exam_history'))) || [];
let favoriteIds = JSON.parse(localStorage.getItem(FSAuth.key('fahrschule_favorites')) || '[]');
let learnedIds = JSON.parse(localStorage.getItem(FSAuth.key('fahrschule_learned')) || '[]');
let currentMode = null; // 'learn', 'exam', 'errors', 'exam_review'
let examMistakePoints = 0;
let timerInterval = null;
let examTimeLeft = 30 * 60; // 30 Minuten
let sessionAnswers = []; // Speichert Zustand jeder Frage: { selected: [], evaluated: false, isCorrect: false }
let lastFinishedExam = null;

// Kategorie-Zuordnung aus den Themen-IDs (CTOnline BMVIT)
const categoryMap = {
    '162739226': 'BE - Vorschriften',
    '162739227': 'BE - Fahrzeugtechnik',
    '162739228': 'BE - Ankuppeln, Abkuppeln',
    '162739229': 'BE - Gefahrenlehre, Gefahrenvermeidung',
    '162739230': 'E - Vorschriften',
    '162739231': 'E - Bremsanlagen',
    '162739232': 'E - Ladetätigkeiten, Ladungssicherung',
    '162739233': 'E - Ankuppeln, Abkuppeln',
    '162739234': 'E - Gefahrenlehre, Gefahrenvermeidung'
};

// Reihenfolge der Abschnitte für die Anzeige (orientiert an den CTOnline Screenshots)
const categoryOrder = [
    'BE - Gefahrenlehre, Gefahrenvermeidung',
    'E - Vorschriften',
    'E - Bremsanlagen',
    'E - Ladetätigkeiten, Ladungssicherung',
    'E - Ankuppeln, Abkuppeln',
    'E - Gefahrenlehre, Gefahrenvermeidung',
    'BE - Vorschriften',
    'BE - Fahrzeugtechnik',
    'BE - Ankuppeln, Abkuppeln'
];

// DOM Elements
const screens = {
    home: document.getElementById('screen-home'),
    categories: document.getElementById('screen-categories'),
    question: document.getElementById('screen-question'),
    result: document.getElementById('screen-result'),
    results: document.getElementById('screen-results')
};

const qProgress = document.getElementById('question-progress');
const qCategory = document.getElementById('question-category');
const qPoints = document.getElementById('question-points');
const qText = document.getElementById('question-text');
const imageContainer = document.getElementById('question-image-container');
const optionsContainer = document.getElementById('options-container');
const btnPrev = document.getElementById('btn-prev');
const btnCheck = document.getElementById('btn-check');
const btnNext = document.getElementById('btn-next');
const feedbackContainer = document.getElementById('feedback-container');
const feedbackMessage = document.getElementById('feedback-message');
const feedbackIcon = document.getElementById('feedback-icon');
const examTimerContainer = document.getElementById('exam-timer-container');
const examTimer = document.getElementById('exam-timer');
const quickErrorBadge = document.getElementById('quick-error-badge');
const quickErrorCount = document.getElementById('quick-error-count');

// Icons
const iconCheck = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
const iconX = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;

// Fragen werden 1:1 aus questions.js (Original-Export) geladen und geparst
async function fetchAndParseQuestions() {
    try {
        if (Array.isArray(window.QUESTIONS_DATABASE) && window.QUESTIONS_DATABASE.length) {
            return window.QUESTIONS_DATABASE.filter(q => q.question && q.options && q.correctAnswers);
        }
        const res = await fetch('questions.json');
        if (!res.ok) throw new Error('HTTP Fehler beim Laden der questions.json');
        const questions = await res.json();
        return Array.isArray(questions) ? questions.filter(q => q.question && q.options && q.correctAnswers) : [];
    } catch (e) {
        console.error('Fehler beim Laden der Fragen:', e);
        return [];
    }
}

// Antwortmöglichkeiten als [{ key, text }] (unterstützt auch ältere gespeicherte Objekt-Formate)
function getOptionList(q) {
    if (Array.isArray(q.options)) return q.options;
    return Object.entries(q.options || {}).map(([key, text]) => ({ key, text }));
}

// Initialisierung der App
async function initApp() {
    allQuestions = await fetchAndParseQuestions();
    updateErrorBadge();
    updateFavoriteBadge();
    updateReadiness();

    if (allQuestions.length === 0) {
        alert("Keine Fragen gefunden! Bitte starte die App über die start.bat bzw. einen lokalen Server (Python).");
    }

    // Navigation setup
    const goHome = () => showScreen('home');
    document.getElementById('nav-home-icon').addEventListener('click', goHome);
    document.getElementById('nav-home').addEventListener('click', goHome);
    document.getElementById('nav-brand').addEventListener('click', goHome);
    
    // Hauptnavigation
    document.getElementById('nav-learn').addEventListener('click', showCategoriesScreen);
    document.getElementById('nav-exam').addEventListener('click', () => startSession('exam'));
    document.getElementById('nav-results').addEventListener('click', showResultsScreen);
    
    // Startbildschirm Buttons
    document.getElementById('btn-start-learn').addEventListener('click', showCategoriesScreen);
    document.getElementById('btn-start-exam').addEventListener('click', () => startSession('exam'));
    document.getElementById('btn-start-results').addEventListener('click', showResultsScreen);
    document.getElementById('btn-start-errors').addEventListener('click', () => startSession('errors'));
    quickErrorBadge.addEventListener('click', () => startSession('errors'));
    document.getElementById('btn-start-favorites').addEventListener('click', () => startSession('favorites'));
    document.getElementById('quick-favorite-badge').addEventListener('click', () => startSession('favorites'));

    // Kategorie-Screen Buttons
    document.getElementById('btn-learn-all').addEventListener('click', () => startSession('learn', allQuestions));
    document.getElementById('btn-learn-selected').addEventListener('click', startSelectedCategories);

    // Frage-Screen Buttons
    btnPrev.addEventListener('click', prevQuestion);
    document.getElementById('question-info-button').addEventListener('click', (event) => {
        const button = event.currentTarget;
        const info = document.getElementById('question-info-text');
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        button.title = expanded ? 'Infotext anzeigen' : 'Infotext ausblenden';
        button.setAttribute('aria-label', button.title);
        info.classList.toggle('hidden', expanded);
    });
    document.getElementById('btn-favorite').addEventListener('click', toggleFavorite);
    imageContainer.addEventListener('click', openImageLightbox);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeImageLightbox(); });
    btnCheck.addEventListener('click', checkAnswer);
    btnNext.addEventListener('click', nextQuestion);
    
    // Zwischenergebnis Buttons
    document.getElementById('btn-view-all-results').addEventListener('click', showResultsScreen);
    document.getElementById('btn-exam-repeat-mistakes').addEventListener('click', repeatLastExamMistakes);
    
    // Ergebnis-Screen Buttons
    document.getElementById('btn-clear-results-history').addEventListener('click', clearExamHistory);
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden');
    }
    stopTimer();
    updateErrorBadge();
}

function updateErrorBadge() {
    if (quickErrorCount) {
        quickErrorCount.textContent = errorLog.length;
        if (errorLog.length > 0) {
            quickErrorBadge.classList.remove('hidden');
        } else {
            quickErrorBadge.classList.add('hidden');
        }
    }
}

function updateFavoriteBadge() {
    const count = document.getElementById('quick-favorite-count');
    if (count) count.textContent = favoriteIds.length;
}

function updateReadiness() {
    const total = allQuestions.length;
    const mastered = allQuestions.filter(q => learnedIds.includes(q.id)).length;
    const percent = total ? Math.round(mastered / total * 100) : 0;
    document.getElementById('readiness-percent').textContent = `${percent} %`;
    document.getElementById('readiness-bar').style.width = `${percent}%`;
    document.getElementById('readiness-detail').textContent = `${mastered} von ${total} Fragen richtig gelernt`;
}

function toggleFavorite() {
    const id = currentQuestions[currentIndex].id;
    favoriteIds = favoriteIds.includes(id) ? favoriteIds.filter(item => item !== id) : [...favoriteIds, id];
    localStorage.setItem(FSAuth.key('fahrschule_favorites'), JSON.stringify(favoriteIds));
    updateFavoriteBadge();
    renderFavoriteButton();
}

function renderFavoriteButton() {
    const saved = favoriteIds.includes(currentQuestions[currentIndex]?.id);
    document.getElementById('favorite-icon').textContent = saved ? '★' : '☆';
    document.getElementById('favorite-label').textContent = saved ? 'Aus Merkliste entfernen' : 'Zur Merkliste';
    document.getElementById('btn-favorite').setAttribute('aria-pressed', String(saved));
}

function openImageLightbox(event) {
    if (event.target.tagName !== 'IMG') return;
    let modal = document.getElementById('image-lightbox');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'image-lightbox';
        modal.className = 'fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4';
        modal.innerHTML = '<button type="button" class="absolute top-4 right-4 text-white text-4xl leading-none" aria-label="Schließen">&times;</button><img class="max-w-full max-h-full object-contain" alt="Vergrößertes Fragenbild">';
        modal.addEventListener('click', closeImageLightbox);
        document.body.appendChild(modal);
    }
    modal.querySelector('img').src = event.target.src;
    modal.classList.remove('hidden');
}

function closeImageLightbox() {
    const modal = document.getElementById('image-lightbox');
    if (modal) modal.classList.add('hidden');
}

// ----------------------------------------------------
// ABSCHNITTE / KATEGORIEN ANZEIGEN & WÄHLEN
// ----------------------------------------------------
function showCategoriesScreen() {
    showScreen('categories');
    const container = document.getElementById('categories-container');
    container.innerHTML = '';

    document.getElementById('total-questions-count').textContent = allQuestions.length;

    // Zähle Fragen & Fehler pro Kategorie
    const catStats = {};
    categoryOrder.forEach(cat => {
        catStats[cat] = { total: 0, errors: 0, learned: 0 };
    });

    allQuestions.forEach(q => {
        if (!catStats[q.category]) {
            catStats[q.category] = { total: 0, errors: 0, learned: 0 };
        }
        catStats[q.category].total++;
        if (errorLog.includes(q.id)) {
            catStats[q.category].errors++;
        }
        if (learnedIds.includes(q.id)) catStats[q.category].learned++;
    });

    // Erstelle Liste
    categoryOrder.forEach((catName, idx) => {
        const stats = catStats[catName] || { total: 0, errors: 0, learned: 0 };
        const learnedPercent = stats.total ? Math.round(stats.learned / stats.total * 100) : 0;
        const row = document.createElement('div');
        row.className = 'p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer group';
        
        // Farbe für Statuskreis (Grün wenn 0 Fehler, Gelb wenn einige, Rot wenn viele)
        let circleColor = 'text-emerald-500';
        if (stats.errors > 0) {
            circleColor = stats.errors > 5 ? 'text-amber-500' : 'text-emerald-500';
        }

        row.innerHTML = `
            <div class="flex items-center space-x-4 flex-1">
                <input type="checkbox" class="category-checkbox w-5 h-5 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer" data-category="${catName}">
                <div class="flex-1">
                    <span class="font-semibold text-slate-800 text-base sm:text-lg group-hover:text-red-600 transition">${catName}</span>
                    <div class="flex items-center space-x-3 mt-1 text-xs text-slate-400">
                        <span>${stats.total} Fragen</span>
                        <span>${learnedPercent}% gelernt</span>
                        ${stats.errors > 0 ? `<span class="text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded-full">${stats.errors} Fehler offen</span>` : ''}
                    </div>
                    <div class="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width:${learnedPercent}%"></div></div>
                </div>
            </div>
            <div class="flex items-center space-x-4">
                <span class="font-bold text-slate-600 text-sm hidden sm:inline">${stats.total}</span>
                <svg class="w-6 h-6 ${circleColor}" fill="currentColor" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="4"></circle>
                    <circle cx="10" cy="10" r="4" fill="currentColor"></circle>
                </svg>
                <button class="btn-start-single-cat bg-slate-100 hover:bg-red-600 hover:text-white text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition" data-category="${catName}">
                    Start
                </button>
            </div>
        `;

        // Klick auf Start-Button dieses Abschnitts
        row.querySelector('.btn-start-single-cat').addEventListener('click', (e) => {
            e.stopPropagation();
            startSingleCategory(catName);
        });

        // Klick auf die Zeile schaltet Checkbox um
        row.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('btn-start-single-cat')) {
                const cb = row.querySelector('.category-checkbox');
                cb.checked = !cb.checked;
                updateSelectedCategoriesCount();
            }
        });

        row.querySelector('.category-checkbox').addEventListener('change', updateSelectedCategoriesCount);

        container.appendChild(row);
    });

    updateSelectedCategoriesCount();
}

function updateSelectedCategoriesCount() {
    const checked = Array.from(document.querySelectorAll('.category-checkbox:checked')).map(cb => cb.dataset.category);
    const count = allQuestions.filter(q => checked.includes(q.category)).length;
    document.getElementById('selected-questions-count').textContent = count;
}

function startSingleCategory(catName) {
    const questions = allQuestions.filter(q => q.category === catName);
    if (questions.length === 0) {
        alert("Keine Fragen in diesem Abschnitt gefunden.");
        return;
    }
    startSession('learn', questions);
}

function startSelectedCategories() {
    const checked = Array.from(document.querySelectorAll('.category-checkbox:checked')).map(cb => cb.dataset.category);
    if (checked.length === 0) {
        alert("Bitte wähle mindestens einen Abschnitt aus oder klicke auf 'Alle Fragen'.");
        return;
    }
    const questions = allQuestions.filter(q => checked.includes(q.category));
    startSession('learn', questions);
}

// Baut Fragegruppen aus der parent-Verknüpfung in questions.js.
// Haupt- und Nebenfragen werden nach ihrer Fragennummer direkt nacheinander gezeigt.
function getQuestionGroups(questions) {
    const byId = new Map(questions.map(q => [String(q.id), q]));
    const roots = new Map(questions.map(q => [String(q.id), String(q.id)]));
    const findRoot = id => {
        let root = roots.get(id) || id;
        while (roots.get(root) && roots.get(root) !== root) root = roots.get(root);
        let current = id;
        while (roots.get(current) && roots.get(current) !== root) {
            const next = roots.get(current);
            roots.set(current, root);
            current = next;
        }
        return root;
    };

    for (const q of questions) {
        const parentId = String(q.parent || '');
        const id = String(q.id);
        if (!parentId || !byId.has(parentId)) continue;
        const childRoot = findRoot(id);
        const parentRoot = findRoot(parentId);
        if (childRoot !== parentRoot) roots.set(childRoot, parentRoot);
    }

    const groups = new Map();
    for (const q of questions) {
        const root = findRoot(String(q.id));
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(q);
    }
    return Array.from(groups.values()).map(group => group.sort((a, b) =>
        Number(a.number) - Number(b.number)
    ));
}

function shuffleItems(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function questionsFromGroups(selectedQuestions, maxQuestions = Infinity) {
    const selectedIds = new Set(selectedQuestions.map(q => String(q.id)));
    const groups = shuffleItems(getQuestionGroups(allQuestions).filter(group =>
        group.some(q => selectedIds.has(String(q.id)))
    ));
    const result = [];
    for (const group of groups) {
        if (group.length <= maxQuestions - result.length) result.push(...group);
        if (result.length >= maxQuestions) break;
    }
    return result;
}

// ----------------------------------------------------
// SESSION STARTEN (LERNEN, PRÜFUNG, FEHLER)
// ----------------------------------------------------
function startSession(mode, customQuestions = null) {
    currentMode = mode;
    currentIndex = 0;
    examMistakePoints = 0;
    sessionAnswers = [];

    if (customQuestions) {
        currentQuestions = questionsFromGroups(customQuestions);
    } else if (mode === 'learn') {
        currentQuestions = questionsFromGroups(allQuestions);
    } else if (mode === 'exam') {
        // Prüfungsfragen werden gruppenweise ausgewählt; parent-Kinder bleiben zusammen.
        currentQuestions = questionsFromGroups(allQuestions, Math.min(40, allQuestions.length));
    } else if (mode === 'errors') {
        currentQuestions = questionsFromGroups(allQuestions.filter(q => errorLog.includes(q.id)));
        if (currentQuestions.length === 0) {
            alert("Dein Fehlerspeicher ist leer! Klasse, du hast aktuell keine offenen Fehler.");
            return;
        }
    } else if (mode === 'favorites') {
        currentQuestions = questionsFromGroups(allQuestions.filter(q => favoriteIds.includes(q.id)));
        if (currentQuestions.length === 0) {
            alert('Deine Merkliste ist noch leer. Markiere Fragen mit dem Stern.');
            return;
        }
    }

    // Initialisiere sessionAnswers Array
    sessionAnswers = currentQuestions.map(() => ({
        selected: [],
        evaluated: false,
        isCorrect: false
    }));

    showScreen('question');
    renderQuestion();
    if (mode === 'exam') startTimer();
}

// ----------------------------------------------------
// TIMER (FÜR PRÜFUNGSMODUS)
// ----------------------------------------------------
function startTimer() {
    examTimeLeft = 30 * 60;
    updateTimerDisplay();
    examTimerContainer.classList.remove('hidden');
    
    timerInterval = setInterval(() => {
        examTimeLeft--;
        updateTimerDisplay();
        if (examTimeLeft <= 0) {
            stopTimer();
            alert("Die Prüfungszeit von 30 Minuten ist abgelaufen!");
            finishSession();
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    examTimerContainer.classList.add('hidden');
}

function updateTimerDisplay() {
    const m = Math.floor(examTimeLeft / 60).toString().padStart(2, '0');
    const s = (examTimeLeft % 60).toString().padStart(2, '0');
    examTimer.textContent = `${m}:${s}`;
}

// ----------------------------------------------------
// FRAGE RENDERN & ZURÜCK-BUTTON FUNKTION
// ----------------------------------------------------
function renderQuestion() {
    const q = currentQuestions[currentIndex];
    const isExam = currentMode === 'exam';
    const state = sessionAnswers[currentIndex] || { selected: [], evaluated: false, isCorrect: false };

    // Info-Leiste
    qProgress.textContent = `Frage ${currentIndex + 1} / ${currentQuestions.length} ${isExam ? '(Prüfung)' : ''}`;
    qCategory.textContent = q.category || 'Abschnitt';
    qPoints.textContent = `Punkte: ${q.points}`;
    qText.textContent = q.question;
    const infoButton = document.getElementById('question-info-button');
    const infoText = document.getElementById('question-info-text');
    infoText.textContent = q.explanation || '';
    infoText.classList.add('hidden');
    infoButton.classList.toggle('hidden', isExam || !q.explanation);
    infoButton.setAttribute('aria-expanded', 'false');
    infoButton.title = 'Infotext anzeigen';
    infoButton.setAttribute('aria-label', 'Infotext anzeigen');
    
    // Der Zurück-Button ist in der Prüfung grundsätzlich entfernt.
    btnPrev.classList.toggle('hidden', isExam);
    if (currentIndex > 0) {
        btnPrev.disabled = false;
        btnPrev.classList.remove('opacity-40', 'cursor-not-allowed');
    } else {
        btnPrev.disabled = true;
        btnPrev.classList.add('opacity-40', 'cursor-not-allowed');
    }

    // Bild rendern
    if (q.image) {
        imageContainer.innerHTML = `<img src="${q.image}" alt="Fragenbild – zum Vergrößern anklicken" class="max-h-80 object-contain rounded-lg shadow-sm mx-auto border border-slate-200 cursor-zoom-in" onerror="if(this.src.includes('Fragen/')){this.src=this.src.replace('Fragen/','fragen/');}else if(this.src.includes('fragen/')){this.src=this.src.replace('fragen/','Fragen/');}else{this.parentElement.classList.add('hidden');}">`;
        imageContainer.classList.remove('hidden');
    } else {
        imageContainer.innerHTML = '';
        imageContainer.classList.add('hidden');
    }
    renderFavoriteButton();
    const examProgress = document.getElementById('exam-progress-container');
    examProgress.classList.toggle('hidden', !isExam);
    if (isExam) {
        const percent = Math.round((currentIndex + 1) / currentQuestions.length * 100);
        document.getElementById('exam-progress-bar').style.width = `${percent}%`;
        document.getElementById('exam-progress-label').textContent = `${currentIndex + 1} / ${currentQuestions.length}`;
        const groups = getQuestionGroups(currentQuestions);
        let groupOffset = 0;
        let groupIndex = 0;
        let memberIndex = 0;
        let currentGroup = [];
        for (let index = 0; index < groups.length; index++) {
            const group = groups[index];
            if (currentIndex < groupOffset + group.length) {
                groupIndex = index;
                memberIndex = currentIndex - groupOffset;
                currentGroup = group;
                break;
            }
            groupOffset += group.length;
        }
        const role = currentGroup.length > 1 ? (memberIndex === 0 ? 'Hauptfrage' : 'Nebenfrage') : 'Einzelfrage';
        qProgress.textContent = `Frage ${currentIndex + 1} / ${currentQuestions.length} · ${role} (Paar ${groupIndex + 1})`;
    }
    
    optionsContainer.innerHTML = '';
    feedbackContainer.classList.add('hidden');

    // Antwort-Optionen generieren
    getOptionList(q).forEach(({ key, text }) => {
        const isSelected = state.selected.includes(key);
        const btn = document.createElement('div');
        btn.className = `option-btn p-4 border rounded-xl cursor-pointer bg-slate-50 flex items-start space-x-4 text-slate-700 hover:shadow-sm ${isSelected ? 'selected' : ''}`;
        btn.dataset.key = key;
        
        // Custom Checkbox
        const checkbox = document.createElement('div');
        checkbox.className = `w-6 h-6 border-2 rounded flex-shrink-0 flex items-center justify-center transition-colors mt-0.5 ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-300 bg-white'}`;
        if (isSelected) {
            checkbox.innerHTML = `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
        }
        
        const labelText = document.createElement('span');
        labelText.className = 'leading-snug text-base sm:text-lg';
        labelText.textContent = text;
        
        btn.appendChild(checkbox);
        btn.appendChild(labelText);
        
        // Klick-Event zur Auswahl
        btn.addEventListener('click', () => {
            // Im Lernmodus gesperrt wenn bereits aufgelöst
            if (!isExam && state.evaluated) return;

            btn.classList.toggle('selected');
            const nowSelected = btn.classList.contains('selected');
            
            if (nowSelected) {
                checkbox.className = 'w-6 h-6 border-2 border-blue-500 bg-blue-500 rounded flex-shrink-0 flex items-center justify-center transition-colors mt-0.5';
                checkbox.innerHTML = `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
                if (!state.selected.includes(key)) state.selected.push(key);
            } else {
                checkbox.className = 'w-6 h-6 border-2 border-slate-300 bg-white rounded flex-shrink-0 flex items-center justify-center transition-colors mt-0.5';
                checkbox.innerHTML = '';
                state.selected = state.selected.filter(k => k !== key);
            }
        });
        
        optionsContainer.appendChild(btn);
    });

    // Buttons & Feedback Wiederherstellen
    if (state.evaluated && !isExam) {
        // Wenn Frage bereits im Lernmodus aufgelöst wurde
        showFeedback(state.isCorrect, q, state.selected, false);
        if (state.autoMarked) {
            feedbackMessage.textContent = 'Automatisch falsch, weil die Hauptfrage falsch beantwortet wurde.';
        }
        btnCheck.classList.add('hidden');
        btnNext.classList.remove('hidden');
    } else {
        btnCheck.textContent = isExam ? 'Antwort einloggen' : 'Auflösen';
        btnCheck.classList.remove('hidden');
        btnNext.classList.add('hidden');
    }

}

// Vorherige Frage ansehen
function prevQuestion() {
    if (currentIndex > 0) {
        currentIndex--;
        renderQuestion();
    }
}

// Antwort prüfen / einloggen
function checkAnswer() {
    const q = currentQuestions[currentIndex];
    const state = sessionAnswers[currentIndex];
    const selectedOptions = state.selected;
    
    const isCorrect = 
        selectedOptions.length === q.correctAnswers.length && 
        selectedOptions.every(val => q.correctAnswers.includes(val));

    if (currentMode === 'exam' && state.evaluated && !state.isCorrect) examMistakePoints -= q.points;
    state.evaluated = true;
    state.isCorrect = isCorrect;

    // Fehler-Management
    if (!isCorrect) {
        if (!errorLog.includes(q.id)) {
            errorLog.push(q.id);
            saveErrors();
        }
        if (currentMode === 'exam') {
            examMistakePoints += q.points;
        }
    } else {
        if (currentMode !== 'exam' && errorLog.includes(q.id)) {
            errorLog = errorLog.filter(id => id !== q.id);
            saveErrors();
        }
    }

    if (currentMode !== 'exam') {
        if (isCorrect && !learnedIds.includes(q.id)) learnedIds.push(q.id);
        if (!isCorrect) learnedIds = learnedIds.filter(id => id !== q.id);
        localStorage.setItem(FSAuth.key('fahrschule_learned'), JSON.stringify(learnedIds));
        updateReadiness();
    }

    if (currentMode === 'exam' && !isCorrect) markDependentQuestionsWrong(q);

    if (currentMode === 'exam') {
        nextQuestion();
    } else {
        showFeedback(isCorrect, q, selectedOptions, true);
    }
}

function markDependentQuestionsWrong(parentQuestion) {
    let errorsChanged = false;

    currentQuestions.forEach((question, index) => {
        if (index <= currentIndex || String(question.parent || '') !== String(parentQuestion.id)) return;
        const state = sessionAnswers[index];
        if (!state || state.evaluated) return;

        state.selected = [];
        state.evaluated = true;
        state.isCorrect = false;
        state.autoMarked = true;

        if (!errorLog.includes(question.id)) {
            errorLog.push(question.id);
            errorsChanged = true;
        }
        if (currentMode === 'exam') {
            examMistakePoints += question.points;
        }
    });

    if (errorsChanged) saveErrors();
}

function showFeedback(isCorrect, q, selectedOptions, isNewCheck = true) {
    btnCheck.classList.add('hidden');
    btnNext.classList.remove('hidden');
    
    feedbackContainer.classList.remove('hidden', 'bg-green-50', 'border-green-200', 'text-green-800', 'bg-red-50', 'border-red-200', 'text-red-800');
    
    // Markiere richtige und falsche Optionen farblich
    Array.from(optionsContainer.children).forEach(btn => {
        const key = btn.dataset.key;
        if (q.correctAnswers.includes(key)) {
            btn.classList.add('correct');
        } else if (selectedOptions.includes(key)) {
            btn.classList.add('incorrect');
        }
    });

    if (isCorrect) {
        feedbackContainer.classList.add('bg-green-50', 'border-green-200', 'text-green-900');
        feedbackIcon.innerHTML = iconCheck;
        feedbackMessage.textContent = 'Richtig beantwortet!';
        feedbackIcon.className = 'text-green-600';
    } else {
        feedbackContainer.classList.add('bg-red-50', 'border-red-200', 'text-red-900');
        feedbackIcon.innerHTML = iconX;
        feedbackMessage.textContent = 'Leider falsch!';
        feedbackIcon.className = 'text-red-600';
    }
}

function nextQuestion() {
    let nextIndex = currentIndex + 1;
    if (currentMode === 'exam') {
        while (nextIndex < currentQuestions.length && sessionAnswers[nextIndex]?.autoMarked) nextIndex++;
    }

    if (currentMode === 'exam' && nextIndex >= currentQuestions.length) {
        const unanswered = sessionAnswers.filter(answer => !answer.evaluated && !answer.selected.length).length;
        if (unanswered && !confirm(`Es sind ${unanswered} Fragen unbeantwortet. Prüfung trotzdem beenden?`)) {
            renderQuestion();
            return;
        }
        finishSession();
        return;
    }
    currentIndex = nextIndex;
    if (currentIndex >= currentQuestions.length) {
        finishSession();
    } else {
        renderQuestion();
    }
}

// ----------------------------------------------------
// SESSION ABSCHLIESSEN (PRÜFUNGSERGEBNIS SPEICHERN)
// ----------------------------------------------------
function finishSession() {
    stopTimer();
    
    if (currentMode === 'exam') {
        sessionAnswers.forEach((answer, index) => {
            if (!answer.evaluated) examMistakePoints += currentQuestions[index].points;
        });
        const correctCount = sessionAnswers.filter(a => a.isCorrect).length;
        const percentage = currentQuestions.length
            ? Math.round((correctCount / currentQuestions.length) * 100)
            : 0;
        const passed = percentage >= 80;
        const wrongCount = currentQuestions.length - correctCount;

        // Erstelle detaillierten Prüfungs-Datensatz
        const examRecord = {
            id: Date.now().toString(),
            date: new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            passed: passed,
            mistakePoints: examMistakePoints,
            totalQuestions: currentQuestions.length,
            correctCount: correctCount,
            percentage: percentage,
            wrongCount: wrongCount,
            timeSpentSeconds: (30 * 60) - examTimeLeft,
            questions: currentQuestions.map((q, idx) => ({
                id: q.id,
                number: q.number,
                question: q.question,
                category: q.category,
                points: q.points,
                image: q.image,
                options: q.options,
                correctAnswers: q.correctAnswers,
                explanation: q.explanation,
                selected: sessionAnswers[idx] ? sessionAnswers[idx].selected : [],
                isCorrect: sessionAnswers[idx] ? sessionAnswers[idx].isCorrect : false,
                autoMarked: sessionAnswers[idx] ? Boolean(sessionAnswers[idx].autoMarked) : false
            }))
        };

        lastFinishedExam = examRecord;
        examHistory.unshift(examRecord);
        localStorage.setItem(FSAuth.key('fahrschule_exam_history'), JSON.stringify(examHistory));

        // Zeige Zwischenergebnis
        showScreen('result');
        const title = document.getElementById('result-title');
        const iconCont = document.getElementById('result-icon-container');
        
        if (passed) {
            title.textContent = "Prüfung bestanden!";
            title.className = "text-4xl font-extrabold mb-4 text-green-600";
            iconCont.className = "w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-6 bg-green-100 text-green-600";
            iconCont.innerHTML = `<svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
        } else {
            title.textContent = "Prüfung nicht bestanden!";
            title.className = "text-4xl font-extrabold mb-4 text-red-600";
            iconCont.className = "w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-6 bg-red-100 text-red-600";
            iconCont.innerHTML = `<svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>`;
        }
        
        document.getElementById('result-text').textContent = `${percentage} % richtig (${correctCount} von ${currentQuestions.length} Fragen). Fehlerpunkte: ${examMistakePoints}.`;
        document.getElementById('result-subtext').textContent = passed
            ? 'Bestanden: Du hast die erforderlichen 80 % erreicht.'
            : 'Zum Bestehen brauchst du mindestens 80 % richtige Antworten. Wiederhole deine Fehler gezielt.';
    } else {
        alert("Übungseinheit beendet! Sehr gut gemacht.");
        showScreen('home');
    }
}

function repeatLastExamMistakes() {
    if (!lastFinishedExam) return;
    const wrongQuestions = lastFinishedExam.questions.filter(q => !q.isCorrect);
    if (wrongQuestions.length === 0) {
        alert("Du hattest in dieser Prüfung 0 Fehler! Es gibt nichts zu wiederholen. Super Leistung!");
        return;
    }
    startSession('learn', wrongQuestions);
}

// ----------------------------------------------------
// ERGEBNIS-SCREEN (PRÜFUNGSHISTORIE & FEHLER WIEDERHOLEN)
// ----------------------------------------------------
function showResultsScreen() {
    showScreen('results');
    renderResultsHistory();
}

function renderResultsHistory() {
    const list = document.getElementById('results-history-list');
    list.innerHTML = '';

    if (!examHistory || examHistory.length === 0) {
        list.innerHTML = `
            <div class="bg-white rounded-2xl p-12 text-center border border-slate-200">
                <div class="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </div>
                <h3 class="text-xl font-bold text-slate-700 mb-2">Noch keine Prüfungen absolviert</h3>
                <p class="text-slate-500 text-sm mb-6">Starte deinen ersten Probelauf, um deine Prüfungsergebnisse hier zu analysieren.</p>
                <button onclick="startSession('exam')" class="bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold shadow hover:bg-red-700 transition">
                    Jetzt Prüfung starten
                </button>
            </div>
        `;
        return;
    }

    examHistory.forEach((exam, index) => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden';
        
        const isPassed = exam.passed;
        const percentage = Number.isFinite(exam.percentage)
            ? exam.percentage
            : (exam.totalQuestions ? Math.round((exam.correctCount / exam.totalQuestions) * 100) : 0);
        const badgeColor = isPassed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200';
        const badgeText = isPassed ? 'BESTANDEN' : 'NICHT BESTANDEN';
        
        const mins = Math.floor((exam.timeSpentSeconds || 0) / 60);
        const secs = (exam.timeSpentSeconds || 0) % 60;
        const timeFormatted = `${mins}m ${secs}s`;

        card.innerHTML = `
            <div class="p-5 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border-b border-slate-100">
                <div>
                    <div class="flex items-center space-x-3 mb-1">
                        <span class="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${badgeColor}">
                            ${badgeText}
                        </span>
                        <span class="text-xs text-slate-400 font-semibold">${exam.date}</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-600 font-medium">
                        <span class="font-bold text-slate-900">${exam.mistakePoints} Fehlerpunkte</span>
                        <span class="text-slate-300">•</span>
                        <span>${exam.correctCount} / ${exam.totalQuestions} richtig</span>
                        <span class="text-slate-300">•</span>
                        <span>${percentage} %</span>
                        <span class="text-slate-300">•</span>
                        <span>Dauer: ${timeFormatted}</span>
                    </div>
                </div>

                <div class="flex items-center space-x-3 w-full sm:w-auto">
                    ${exam.wrongCount > 0 ? `
                        <button class="btn-repeat-exam-mistakes flex-1 sm:flex-none bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5" data-exam-id="${exam.id}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            <span>Fehler wiederholen (${exam.wrongCount})</span>
                        </button>
                    ` : ''}
                    <button class="btn-toggle-exam-details flex-1 sm:flex-none bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1" data-exam-id="${exam.id}">
                        <span>Details anzeigen</span>
                        <svg class="w-4 h-4 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                </div>
            </div>

            <!-- Aufklappbare Detail-Liste aller Fragen -->
            <div id="details-${exam.id}" class="hidden p-5 sm:p-6 bg-slate-50 space-y-4">
                <h4 class="font-bold text-slate-700 text-sm uppercase tracking-wider mb-3">Fragen dieser Prüfung (${exam.totalQuestions})</h4>
                <div class="space-y-3">
                    ${exam.questions.map((q, qIdx) => {
                        const isCorrect = q.isCorrect;
                        const statusClass = isCorrect ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50';
                        const statusIcon = isCorrect ? 'text-emerald-600' : 'text-red-600';
                        
                        return `
                            <div class="p-4 rounded-xl border ${statusClass} bg-white text-sm">
                                <div class="flex items-start justify-between gap-3 mb-2">
                                    <span class="font-bold text-slate-800">Frage ${qIdx + 1}: ${q.question}</span>
                                    <span class="text-xs font-bold ${statusIcon} whitespace-nowrap">${q.autoMarked ? 'Automatisch falsch (Hauptfrage)' : isCorrect ? 'Richtig' : `Falsch (${q.points} P.)`}</span>
                                </div>
                                ${q.image ? `<img src="${q.image}" class="max-h-40 rounded mb-3 mx-auto" onerror="this.remove()">` : ''}
                                <div class="space-y-1 text-xs text-slate-600 mt-2">
                                    ${getOptionList(q).map(({ key: k, text: t }, optIdx) => {
                                        const wasSelected = q.selected && q.selected.includes(k);
                                        const isTrue = q.correctAnswers && q.correctAnswers.includes(k);
                                        let optStyle = 'text-slate-600';
                                        if (isTrue) optStyle = 'font-bold text-emerald-700';
                                        if (wasSelected && !isTrue) optStyle = 'font-bold text-red-600 line-through';
                                        return `<div class="${optStyle}">${wasSelected ? '☑' : '☐'} ${optIdx + 1}) ${t} ${isTrue ? '✓ (Richtig)' : ''}</div>`;
                                    }).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // Event-Listener: Fehler dieser Prüfung wiederholen
        const repeatBtn = card.querySelector('.btn-repeat-exam-mistakes');
        if (repeatBtn) {
            repeatBtn.addEventListener('click', () => {
                const wrongQuestions = exam.questions.filter(q => !q.isCorrect);
                if (wrongQuestions.length > 0) {
                    startSession('learn', wrongQuestions);
                }
            });
        }

        // Event-Listener: Details auf-/zuklappen
        const toggleBtn = card.querySelector('.btn-toggle-exam-details');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const detailsDiv = card.querySelector(`#details-${exam.id}`);
                const isHidden = detailsDiv.classList.contains('hidden');
                detailsDiv.classList.toggle('hidden');
                toggleBtn.querySelector('span').textContent = isHidden ? 'Details ausblenden' : 'Details anzeigen';
                toggleBtn.querySelector('svg').classList.toggle('rotate-180', isHidden);
            });
        }

        list.appendChild(card);
    });
}

function clearExamHistory() {
    if (confirm("Möchtest du deinen gesamten Prüfungsverlauf wirklich löschen?")) {
        examHistory = [];
        localStorage.removeItem(FSAuth.key('fahrschule_exam_history'));
        renderResultsHistory();
    }
}

function saveErrors() {
    localStorage.setItem(FSAuth.key('fahrschule_errors'), JSON.stringify(errorLog));
    updateErrorBadge();
}

// Start
initApp();
