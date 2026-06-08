let timerInterval = null;
let timerStartTime = null;
let timerStopped = false;
let currentThreadData = null;

// ----- Google Sheet export config -----
// Paste the Web App URL of your deployed Google Apps Script here.
// (Apps Script editor -> Deploy -> New deployment -> Web app -> copy the /exec URL)
// The doPost(e) code to paste into Apps Script is in the setup notes.
const GOOGLE_SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzhqu3mT0EuQ7mr0qJf7oF3HAOLgT22A_CySOn-ZfKD-aOycuRbb93hh50Ml2dfS_ucfg/exec';

// Identifies which build this row came from (written to the "Mode" column).
const READING_MODE = 'light';

// ----- Navigation -----
function openThread() {
    document.getElementById('page1').classList.remove('active');
    document.getElementById('page2').classList.add('active');
    window.scrollTo(0, 0);
    startTimer();
}

function closePage2() {
    if (timerInterval) stopTimer();

    document.getElementById('page2').classList.remove('active');
    document.getElementById('page1').classList.add('active');

    window.scrollTo(0, 0);

    document.getElementById('timerToast').classList.remove('show');

    timerStopped = false;
    updateTimerDisplay(0);
}

// ----- Timer -----
function startTimer() {
    timerStopped = false;
    timerStartTime = Date.now();

    clearInterval(timerInterval);

    updateTimerDisplay(0);

    document.getElementById('timerToast').classList.add('show');
    document.getElementById('timerStatus').textContent = 'Timer running...';

    timerInterval = setInterval(() => {
        const elapsedMs = Date.now() - timerStartTime;
        updateTimerDisplay(elapsedMs);
    }, 50);
}

function stopTimer() {
    if (timerStopped || !timerInterval) return;

    timerStopped = true;

    clearInterval(timerInterval);
    timerInterval = null;

    const elapsedMs = Date.now() - timerStartTime;

    document.getElementById('timerStatus').textContent =
        'Timer stopped — saving...';

    document.getElementById('commentBtn').classList.add('ready');

    saveReadingSession(elapsedMs);
}

function updateTimerDisplay(elapsedMs = 0) {
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    const milliseconds = elapsedMs % 1000;

    document.getElementById('timerCount').textContent =
        `${String(minutes).padStart(2, '0')}:` +
        `${String(seconds).padStart(2, '0')}.` +
        `${String(milliseconds).padStart(3, '0')}`;
}

// ----- Save Session -----
function saveReadingSession(elapsedMs) {
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    const milliseconds = elapsedMs % 1000;

    const durationStr =
        `${minutes}m ${seconds}s ${milliseconds}ms`;

    const savedAt = new Date();

    // Keep a lightweight local backup so nothing is lost if the network fails.
    const backupEntry =
        `${savedAt.toISOString()}\t${durationStr}\t${elapsedMs}ms\n`;
    localStorage.setItem(
        'readingSessions',
        (localStorage.getItem('readingSessions') || '') + backupEntry
    );

    // Row payload sent to the spreadsheet.
    const payload = {
        savedAt: savedAt.toISOString(),
        savedAtLocal: savedAt.toLocaleString(),
        mode: READING_MODE,
        durationText: durationStr,
        durationMs: elapsedMs,
        minutes: minutes,
        seconds: seconds,
        milliseconds: milliseconds,
        page: location.href
    };

    // If the endpoint hasn't been configured yet, stop here (backup is kept).
    if (!GOOGLE_SHEET_WEBHOOK_URL ||
        GOOGLE_SHEET_WEBHOOK_URL.startsWith('PASTE_')) {
        console.warn(
            'Google Sheet webhook URL not configured — saved to local backup only.'
        );
        document.getElementById('timerStatus').textContent =
            `Saved locally (${durationStr}) — set Google Sheet URL`;
        showNotify(`Reading time ${durationStr} saved (local backup).`);
        return;
    }

    document.getElementById('timerStatus').textContent =
        `Sending to Google Sheet... (${durationStr})`;

    // POST to the Google Apps Script Web App, which appends a row to the sheet.
    // text/plain + no-cors keeps this a "simple request" so the browser does
    // not block it with a CORS preflight from a static page.
    fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    })
    .then(() => {
        document.getElementById('timerStatus').textContent =
            `Saved to Google Sheet! (${durationStr})`;
        showNotify(`Reading time ${durationStr} saved to Google Sheet.`);
    })
    .catch((err) => {
        console.error('Failed to send reading time to Google Sheet:', err);
        document.getElementById('timerStatus').textContent =
            `Network error — kept local backup (${durationStr})`;
        showNotify(`Couldn't reach Google Sheet. Saved local backup.`);
    });
}

// ----- Notification -----
function showNotify(msg) {
    const el = document.getElementById('notifyToast');

    document.getElementById('notifyMsg').textContent = msg;

    el.classList.add('show');

    setTimeout(() => {
        el.classList.remove('show');
    }, 4000);
}

// ----- Comment validation -----
document.getElementById('commentInput')
    .addEventListener('input', function () {

        const words = this.value
            .trim()
            .split(/\s+/)
            .filter(w => w.length > 0);

        document.getElementById('commentBtn')
            .classList.toggle(
                'ready',
                words.length >= 5
            );
});