// ════════════════════════════════════════════════════════════════
//  QUIZMANIA — Google Apps Script
//  Auto-syncs your Google Sheets questions → JSON files on GitHub
//
//  SETUP INSTRUCTIONS:
//  1. Open any of your question Google Sheets
//  2. Go to Extensions → Apps Script
//  3. Paste this entire script and save
//  4. Fill in YOUR_GITHUB_USERNAME, YOUR_REPO_NAME, YOUR_TOKEN below
//  5. Click "Run" → "syncAllSheets" once to test
//  6. Set up a trigger: Triggers → Add Trigger → syncAllSheets → On edit
// ════════════════════════════════════════════════════════════════

// ── CONFIGURATION — Fill these in ──
const GITHUB_USERNAME = 'YOUR_GITHUB_USERNAME';   // e.g. 'johnsmith'
const GITHUB_REPO     = 'YOUR_REPO_NAME';          // e.g. 'quizmania'
const GITHUB_TOKEN    = 'YOUR_PERSONAL_ACCESS_TOKEN'; // ghp_xxxxxxxxxxxx
const GITHUB_BRANCH   = 'main';

// ── SHEET → FILE MAPPING ──
// Maps each Google Sheet URL to its JSON filename in /data/
const SHEET_MAP = [
  {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1YtfaMQyjTP-p4US-t0FGoh2FrvaSmzN2qr8Dg0Z75a0',
    jsonFile: 'data/google-search-basics.json'
  },
  {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/18HZvi8N-W-MrFhCRveZF8Atz5_qTRqffTChZ70hx4Jk',
    jsonFile: 'data/google-search-advanced.json'
  },
  {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1ds8anNnEUmEGSsc8r1VngybpskNDQHMLC_8hsIAZksU',
    jsonFile: 'data/google-metrics.json'
  },
  {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1RhsiJZ5R-9hD2HnIzEeCjF4dt62Q8qR01WFj61TNH04',
    jsonFile: 'data/google-problem-solution.json'
  },
  {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1rveSTdQ5bNUB9B2tFCIUG-7lrpjxYqeEfAO9c0yev5A',
    jsonFile: 'data/google-advanced-phs.json'
  }
];

// ════════════════════════════════════════════════════════════════
//  MAIN FUNCTION — Run this manually or set as a trigger
// ════════════════════════════════════════════════════════════════
function syncAllSheets() {
  SHEET_MAP.forEach(({ sheetUrl, jsonFile }) => {
    try {
      const questions = readSheetQuestions(sheetUrl);
      pushToGitHub(jsonFile, questions);
      Logger.log(`✅ Synced ${jsonFile} — ${questions.length} questions`);
    } catch (e) {
      Logger.log(`❌ Failed ${jsonFile}: ${e.message}`);
    }
  });
  Logger.log('Sync complete!');
}

// ════════════════════════════════════════════════════════════════
//  READ QUESTIONS FROM SHEET
//  Expects columns: Question | Option A | Option B | Option C | Option D | Correct Answer
// ════════════════════════════════════════════════════════════════
function readSheetQuestions(sheetUrl) {
  const id = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)[1];
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheets()[0]; // First sheet tab
  const data = sheet.getDataRange().getValues();

  const questions = [];
  for (let i = 1; i < data.length; i++) { // Skip header row
    const row = data[i];
    if (!row[0] || String(row[0]).trim() === '') continue;

    const answerText = String(row[5] || '').trim().toLowerCase();
    let ansIndex = 0;
    if (answerText === 'option a' || answerText === 'a') ansIndex = 0;
    else if (answerText === 'option b' || answerText === 'b') ansIndex = 1;
    else if (answerText === 'option c' || answerText === 'c') ansIndex = 2;
    else if (answerText === 'option d' || answerText === 'd') ansIndex = 3;

    questions.push({
      q: String(row[0]).trim(),
      opts: [
        String(row[1] || '').trim(),
        String(row[2] || '').trim(),
        String(row[3] || '').trim(),
        String(row[4] || '').trim()
      ],
      ans: ansIndex
    });
  }
  return questions;
}

// ════════════════════════════════════════════════════════════════
//  PUSH JSON TO GITHUB
// ════════════════════════════════════════════════════════════════
function pushToGitHub(filePath, questions) {
  const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${filePath}`;
  const content = JSON.stringify(questions, null, 2);
  const encoded = Utilities.base64Encode(content, Utilities.Charset.UTF_8);

  // Get current file SHA (needed for updates)
  let sha = null;
  try {
    const getResp = UrlFetchApp.fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      },
      muteHttpExceptions: true
    });
    if (getResp.getResponseCode() === 200) {
      sha = JSON.parse(getResp.getContentText()).sha;
    }
  } catch (e) { /* File doesn't exist yet — will create */ }

  // Push file
  const body = {
    message: `Auto-sync: update ${filePath}`,
    content: encoded,
    branch: GITHUB_BRANCH
  };
  if (sha) body.sha = sha;

  const putResp = UrlFetchApp.fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const code = putResp.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error(`GitHub API error ${code}: ${putResp.getContentText()}`);
  }
}
