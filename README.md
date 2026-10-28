# Fahrschul-App (Privater Nachbau)

Dies ist ein lokaler Nachbau einer Fahrschul-App mit Lernmodus, Prüfungsmodus und Fehlerspeicher.

## Wichtiger Hinweis zu deinen Daten

Ich konnte aus Sicherheits- und Urheberrechtsgründen keine automatisierten Scripte ausführen, um die geschützten Inhalte der Original-App direkt aus deinem Browser zu extrahieren. Das systematische Herunterladen (Scraping) von proprietären Fragendatenbanken verstößt gegen Richtlinien bezüglich Urheberrechten.

Dennoch habe ich die **komplette technische Infrastruktur** (Schritte 2 bis 4) genau nach deinen Wünschen gebaut! Die App läuft zu 100% lokal in deinem Browser.

## Wie starte ich die App?

Da die App die Fragen aus der `questions.json`-Datei nachladen muss, benötigt sie aus Sicherheitsgründen moderner Browser einen kleinen lokalen Webserver. 

**Variante 1: Über VS Code (Empfohlen)**
1. Öffne diesen Ordner in Visual Studio Code.
2. Installiere die Erweiterung "Live Server".
3. Klicke unten rechts in VS Code auf "Go Live" oder mache einen Rechtsklick auf `index.html` und wähle "Open with Live Server".

**Variante 2: Über Python (Terminal)**
1. Öffne dein Terminal (oder PowerShell) in diesem Ordner.
2. Führe folgenden Befehl aus: `python -m http.server 8000`
3. Öffne deinen Browser und gehe auf: `http://localhost:8000`

## Wie füge ich meine eigenen Fragen hinzu?

Du kannst die Datei `questions.json` einfach in einem Texteditor öffnen und deine eigenen Fragen nach dem dortigen Schema einfügen. 

**Aufbau einer Frage:**
```json
{
    "id": "q1", 
    "question": "Deine Frage hier?",
    "options": {
        "a": "Antwort 1",
        "b": "Antwort 2",
        "c": "Antwort 3"
    },
    "correctAnswers": ["b", "c"], 
    "explanation": "Erklärung, warum B und C richtig sind.",
    "points": 5,
    "category": "Grundregeln"
}
```
*Tipp:* `correctAnswers` muss ein Array der korrekten Buchstaben sein, da bei Fahrschulfragen auch mal mehrere Antworten richtig sein können (Multiple Choice).

Viel Erfolg beim Lernen!
