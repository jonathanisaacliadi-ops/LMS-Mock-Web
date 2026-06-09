let timerInterval = null;
let timerStartTime = null;
let timerStopped = false;

// ----- Google Sheet export config -----
// Paste the Web App URL of your deployed Google Apps Script here.
// (Apps Script editor -> Deploy -> New deployment -> Web app -> copy the /exec URL)
// The doPost(e) code to paste into Apps Script is in google-apps-script.gs.
const GOOGLE_SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwmvXyPOpg2eY3ITHcp4lWtrjZz3b6e-Rvew-KOZWPeLNIqpAZ4wk2ZhGCMl9063I1mQw/exec';

// Identifies which build this row came from (written to the "Mode" column).
const READING_MODE = 'light';

// ----- Reading quiz (True / False) -----
// Matches the "papan informasi" passage shown in this (light) build.
// answer: 'B' = Benar (true), 'S' = Salah (false)
const QUIZ = [
    { t: 'Papan informasi berada di dekat pos keamanan.', a: 'B' },
    { t: 'Warga hanya boleh membaca dan tidak boleh menulis di papan informasi.', a: 'S' },
    { t: 'Salah satu isi papan adalah jadwal kegiatan.', a: 'B' },
    { t: 'Anak-anak sering menempelkan gambar buatan mereka.', a: 'B' },
    { t: 'Papan biasanya kosong menjelang akhir minggu.', a: 'S' },
    { t: 'Kebiasaan ini dilakukan setiap Senin pagi.', a: 'S' },
    { t: 'Warga menggunakan papan untuk menjual kendaraan.', a: 'S' },
    { t: 'Rekomendasi tempat makan dapat dituliskan di papan.', a: 'B' },
    { t: 'Kebiasaan tersebut membantu mempererat hubungan antar tetangga.', a: 'B' },
    { t: 'Teks menyebutkan bahwa papan berada di dalam sekolah.', a: 'S' }
];

// ----- Questionnaire (1 = Strongly Disagree ... 10 = Strongly Agree) -----
const SURVEY = [
    {
        id: 'A',
        items: [
            'I was able to read text on the LMS clearly.',
            'My eyes felt comfortable while using the LMS.',
            'I experienced little or no eye strain during the tasks.',
            'The display mode allowed me to focus on the content without visual discomfort.',
            'I did not experience headaches or visual fatigue while using the LMS.',
            'The display mode was comfortable for extended use.'
        ]
    },
    {
        id: 'B',
        items: [
            'The LMS interface was easy to navigate.',
            'I could locate the required information quickly.',
            'The display mode made the LMS visually appealing.',
            'The display mode enhanced my overall experience using the LMS.',
            'I would prefer using the LMS with this display mode in future sessions.'
        ]
    },
    {
        id: 'C',
        items: [
            'I was able to complete the tasks efficiently.',
            'The display mode helped me stay focused on the tasks.',
            'I was able to process information quickly while using the LMS.',
            'The display mode supported my learning activities.',
            'I felt productive while completing the assigned tasks.'
        ]
    }
];

// Collected responses for the whole session (one row per respondent).
const respondent = {
    readingElapsedMs: 0,
    quiz: {},        // q1..q10 -> 'B' / 'S'
    quizScore: 0,
    survey: {}       // a1..a6, b1..b5, c1..c5 -> 1..10
};

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

// Shows one of the survey/quiz/thank-you pages, hiding the rest.
function showSurveyPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
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
    respondent.readingElapsedMs = elapsedMs;

    const durationStr = formatDuration(elapsedMs);

    document.getElementById('timerStatus').textContent =
        `Reading time recorded (${durationStr})`;

    // Lightweight local backup so the reading time isn't lost.
    const backupEntry = `${new Date().toISOString()}\t${durationStr}\t${elapsedMs}ms\n`;
    localStorage.setItem(
        'readingSessions',
        (localStorage.getItem('readingSessions') || '') + backupEntry
    );

    document.getElementById('commentBtn').classList.add('ready');
    showNotify(`Reading time ${durationStr} recorded. Continue to the quiz.`);
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

function formatDuration(elapsedMs) {
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    const milliseconds = elapsedMs % 1000;
    return `${minutes}m ${seconds}s ${milliseconds}ms`;
}

// ----- Render quiz + questionnaire -----
function renderQuiz() {
    document.getElementById('quizForm').innerHTML = QUIZ.map((q, i) => {
        const n = i + 1;
        return `
        <div class="sq">
          <div class="sq-text"><span class="sq-num">${n}.</span> ${q.t}</div>
          <div class="tf-options">
            <label class="tf-opt"><input type="radio" name="q${n}" value="B"><span class="tf-pill">Benar (B)</span></label>
            <label class="tf-opt"><input type="radio" name="q${n}" value="S"><span class="tf-pill">Salah (S)</span></label>
          </div>
        </div>`;
    }).join('');
}

function renderSurvey() {
    SURVEY.forEach(sec => {
        const form = document.getElementById('form' + sec.id);
        form.innerHTML = sec.items.map((text, i) => {
            const name = sec.id.toLowerCase() + (i + 1);
            let scale = '';
            for (let v = 1; v <= 10; v++) {
                scale += `<label class="scale-opt"><input type="radio" name="${name}" value="${v}"><span>${v}</span></label>`;
            }
            return `
            <div class="sq">
              <div class="sq-text"><span class="sq-num">${i + 1}.</span> ${text}</div>
              <div class="scale-row">
                <span class="scale-end">1 · Strongly Disagree</span>
                <div class="scale-opts">${scale}</div>
                <span class="scale-end">Strongly Agree · 10</span>
              </div>
            </div>`;
        }).join('');
    });
}

// ----- Validation helpers -----
function checkedValue(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
}

function allAnswered(prefix, count) {
    for (let i = 1; i <= count; i++) {
        if (checkedValue(prefix + i) === null) return false;
    }
    return true;
}

// ----- Quiz submit -----
function submitQuiz() {
    if (!allAnswered('q', QUIZ.length)) {
        document.getElementById('quizWarn').classList.add('show');
        return;
    }
    document.getElementById('quizWarn').classList.remove('show');

    let score = 0;
    QUIZ.forEach((q, i) => {
        const ans = checkedValue('q' + (i + 1));
        respondent.quiz['q' + (i + 1)] = ans;
        if (ans === q.a) score++;
    });
    respondent.quizScore = score;

    showSurveyPage('page4');
}

// ----- Section navigation -----
function nextSection(sectionId) {
    const sec = SURVEY.find(s => s.id === sectionId);
    const prefix = sectionId.toLowerCase();
    const warn = document.getElementById('warn' + sectionId);

    if (!allAnswered(prefix, sec.items.length)) {
        warn.classList.add('show');
        return;
    }
    warn.classList.remove('show');

    // Store this section's answers.
    sec.items.forEach((_, i) => {
        respondent.survey[prefix + (i + 1)] = Number(checkedValue(prefix + (i + 1)));
    });

    if (sectionId === 'A') showSurveyPage('page5');
    else if (sectionId === 'B') showSurveyPage('page6');
}

// ----- Final submit (one consolidated row) -----
function submitAll() {
    const secC = SURVEY.find(s => s.id === 'C');
    if (!allAnswered('c', secC.items.length)) {
        document.getElementById('warnC').classList.add('show');
        return;
    }
    document.getElementById('warnC').classList.remove('show');
    secC.items.forEach((_, i) => {
        respondent.survey['c' + (i + 1)] = Number(checkedValue('c' + (i + 1)));
    });

    const elapsedMs = respondent.readingElapsedMs;
    const savedAt = new Date();

    // Flat payload: one column per field so each quiz/questionnaire item
    // lands in its own spreadsheet column.
    const payload = {
        savedAt: savedAt.toISOString(),
        savedAtLocal: savedAt.toLocaleString(),
        mode: READING_MODE,
        durationText: formatDuration(elapsedMs),
        durationMs: elapsedMs,
        minutes: Math.floor(elapsedMs / 60000),
        seconds: Math.floor((elapsedMs % 60000) / 1000),
        milliseconds: elapsedMs % 1000,
        quizScore: respondent.quizScore,
        page: location.href
    };
    // a1..a6, b1..b5, c1..c5 (quiz exports only the final quizScore, not per-question)
    Object.keys(respondent.survey).forEach(k => { payload[k] = respondent.survey[k]; });

    // Local backup of the full response.
    localStorage.setItem('lastResponse', JSON.stringify(payload));

    const btn = document.getElementById('finalSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const finish = (msg) => {
        document.getElementById('thanksMsg').textContent = msg;
        showSurveyPage('page7');
    };

    if (!GOOGLE_SHEET_WEBHOOK_URL || GOOGLE_SHEET_WEBHOOK_URL.startsWith('PASTE_')) {
        console.warn('Google Sheet webhook URL not configured — saved to local backup only.');
        finish(`Quiz score: ${respondent.quizScore}/${QUIZ.length}. Saved locally (Google Sheet URL not set).`);
        return;
    }

    fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    })
    .then(() => {
        finish(`Tanggapan Anda telah direkam. Skor kuis: ${respondent.quizScore}/${QUIZ.length}.`);
    })
    .catch((err) => {
        console.error('Failed to send response to Google Sheet:', err);
        finish(`Network error — a local backup was kept. Quiz score: ${respondent.quizScore}/${QUIZ.length}.`);
    });
}

// ----- Notification -----
function showNotify(msg) {
    const el = document.getElementById('notifyToast');
    document.getElementById('notifyMsg').textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4000);
}

// ----- Wire up -----
renderQuiz();
renderSurvey();

// The COMMENT button is always active. Clicking it records the reading time
// (if the timer is still running) and advances to the reading quiz — no comment
// text and no minimum word count are required.
document.getElementById('commentBtn')
    .addEventListener('click', function () {
        if (timerInterval) stopTimer();
        showSurveyPage('page3');
    });
