const STORAGE_KEY = "memoLoopItems";
const THEME_KEY = "memoLoopTheme";
const DASHBOARD_KEY = "memoLoopDashboard";
const CHECK_INTERVAL_MS = 15000;
const SIMILARITY_THRESHOLD = 0.8;
const GRADE_RULES = {
  again: { level: 0, delayMs: 60 * 60 * 1000, label: "לא ידעתי. הכרטיס יחזור בעוד שעה." },
  hard: { level: 1, delayMs: 24 * 60 * 60 * 1000, label: "קשה. הכרטיס יחזור בעוד יום." },
  good: { level: 2, delayMs: 3 * 24 * 60 * 60 * 1000, label: "טוב. הכרטיס יחזור בעוד 3 ימים." },
  easy: { level: 3, delayMs: 7 * 24 * 60 * 60 * 1000, label: "קל. הכרטיס יחזור בעוד 7 ימים." }
};

const form = document.getElementById("learning-form");
const formTitle = document.getElementById("form-title");
const editingIdInput = document.getElementById("editing-id");
const itemTypeInput = document.getElementById("item-type-input");
const questionInput = document.getElementById("question-input");
const answerInput = document.getElementById("answer-input");
const reminderTextInput = document.getElementById("reminder-text-input");
const reminderDateInput = document.getElementById("reminder-date-input");
const qaFields = document.getElementById("qa-fields");
const reminderFields = document.getElementById("reminder-fields");
const submitButton = document.getElementById("submit-button");
const cancelEditButton = document.getElementById("cancel-edit");
const formTypeButtons = document.querySelectorAll("[data-form-type]");
const libraryTabButtons = document.querySelectorAll("[data-library-tab]");
const libraryList = document.getElementById("library-list");
const emptyState = document.getElementById("empty-state");
const dueCount = document.getElementById("due-count");
const itemsCount = document.getElementById("items-count");
const nextReviewLabel = document.getElementById("next-review-label");
const streakValue = document.getElementById("streak-value");
const successRateValue = document.getElementById("success-rate-value");
const answeredTodayValue = document.getElementById("answered-today-value");
const searchInput = document.getElementById("search-input");
const sortInput = document.getElementById("sort-input");
const themeToggle = document.getElementById("theme-toggle");
const reviewModal = document.getElementById("review-modal");
const reviewQuestion = document.getElementById("review-question");
const reviewAnswerInput = document.getElementById("review-answer-input");
const reviewFeedback = document.getElementById("review-feedback");
const focusAnswerButton = document.getElementById("focus-answer");
const submitReviewButton = document.getElementById("submit-review");
const showAnswerButton = document.getElementById("show-answer");
const closeReviewButton = document.getElementById("close-review");
const gradeButtons = document.querySelectorAll("[data-grade]");

let items = loadItems();
let dashboardState = loadDashboardState();
let activeReviewId = null;
let activeLibraryTab = "qa";
let checkTimerId = null;
const shownReminderKeys = new Set();

refreshDashboardForToday();
applyTheme(loadTheme());
updateFormTypeUI();
updateLibraryTabs();
render();
startReviewLoop();
requestNotificationPermission();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (itemTypeInput.value === "qa") {
    saveQaItem();
  } else {
    saveReminderItem();
  }
});

cancelEditButton.addEventListener("click", resetFormState);
libraryList.addEventListener("click", handleListActions);
searchInput.addEventListener("input", render);
sortInput.addEventListener("change", render);
themeToggle.addEventListener("click", toggleTheme);
focusAnswerButton.addEventListener("click", () => reviewAnswerInput.focus());
submitReviewButton.addEventListener("click", submitReview);
showAnswerButton.addEventListener("click", revealAnswer);
closeReviewButton.addEventListener("click", closeReview);

formTypeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    itemTypeInput.value = button.dataset.formType;
    updateFormTypeUI();
  });
});

libraryTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeLibraryTab = button.dataset.libraryTab;
    updateLibraryTabs();
    render();
  });
});

gradeButtons.forEach((button) => {
  button.addEventListener("click", () => applyGradeToActiveItem(button.dataset.grade));
});

reviewAnswerInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    submitReview();
  }
});

reviewModal.addEventListener("click", (event) => {
  if (event.target === reviewModal) {
    closeReview();
  }
});

function saveQaItem() {
  const question = questionInput.value.trim();
  const answer = answerInput.value.trim();
  const editingId = editingIdInput.value;
  if (!question || !answer) {
    return;
  }

  if (editingId) {
    const item = items.find((entry) => entry.id === editingId);
    if (!item || item.type !== "qa") {
      resetFormState();
      return;
    }

    item.question = question;
    item.answer = answer;
  } else {
    const now = Date.now();
    items.unshift({
      id: crypto.randomUUID(),
      type: "qa",
      question,
      answer,
      text: "",
      level: 0,
      correctCount: 0,
      wrongCount: 0,
      score: 0,
      nextReviewDate: now,
      createdAt: now
    });
  }

  saveItems();
  resetFormState();
  render();
}

function saveReminderItem() {
  const text = reminderTextInput.value.trim();
  const scheduledValue = reminderDateInput.value;
  const nextReviewDate = scheduledValue ? new Date(scheduledValue).getTime() : NaN;
  const editingId = editingIdInput.value;

  if (!text || !Number.isFinite(nextReviewDate)) {
    return;
  }

  if (editingId) {
    const item = items.find((entry) => entry.id === editingId);
    if (!item || item.type !== "reminder") {
      resetFormState();
      return;
    }

    item.text = text;
    item.nextReviewDate = nextReviewDate;
  } else {
    items.unshift({
      id: crypto.randomUUID(),
      type: "reminder",
      question: "",
      answer: "",
      text,
      level: 0,
      correctCount: 0,
      wrongCount: 0,
      score: 0,
      nextReviewDate,
      createdAt: Date.now()
    });
  }

  saveItems();
  resetFormState();
  render();
}

function handleListActions(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  const item = items.find((entry) => entry.id === actionButton.dataset.id);
  if (!item) {
    return;
  }

  if (actionButton.dataset.action === "review" && item.type === "qa") {
    openReview(item);
    return;
  }

  if (actionButton.dataset.action === "grade" && item.type === "qa") {
    applyGradeToItem(item, actionButton.dataset.gradeValue);
    return;
  }

  if (actionButton.dataset.action === "edit") {
    startEditing(item);
    return;
  }

  if (actionButton.dataset.action === "delete") {
    deleteItem(item.id);
  }
}

function loadItems() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidItemShape).map(normalizeItem) : [];
  } catch (error) {
    console.error("Failed to parse MemoLoop items:", error);
    return [];
  }
}

function normalizeItem(item) {
  return {
    ...item,
    type: item.type,
    question: typeof item.question === "string" ? item.question : "",
    answer: typeof item.answer === "string" ? item.answer : "",
    text: typeof item.text === "string" ? item.text : "",
    level: clampLevel(item.level ?? 0),
    correctCount: normalizeCounter(item.correctCount),
    wrongCount: normalizeCounter(item.wrongCount),
    score: item.type === "qa" ? normalizeScore(item.correctCount, item.wrongCount) : 0,
    nextReviewDate: Number(item.nextReviewDate),
    createdAt: Number(item.createdAt) || Number(item.nextReviewDate)
  };
}

function isValidItemShape(item) {
  if (!item || typeof item.id !== "string" || !Number.isFinite(Number(item.nextReviewDate))) {
    return false;
  }

  if (item.type === "qa") {
    return typeof item.question === "string" && typeof item.answer === "string";
  }

  if (item.type === "reminder") {
    return typeof item.text === "string";
  }

  return false;
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadDashboardState() {
  const raw = localStorage.getItem(DASHBOARD_KEY);
  const today = getTodayKey();

  if (!raw) {
    return {
      lastActiveDate: today,
      streak: 1,
      dailyDate: today,
      questionsAnsweredToday: 0,
      correctToday: 0,
      wrongToday: 0
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      lastActiveDate: typeof parsed.lastActiveDate === "string" ? parsed.lastActiveDate : today,
      streak: normalizeCounter(parsed.streak || 1) || 1,
      dailyDate: typeof parsed.dailyDate === "string" ? parsed.dailyDate : today,
      questionsAnsweredToday: normalizeCounter(parsed.questionsAnsweredToday),
      correctToday: normalizeCounter(parsed.correctToday),
      wrongToday: normalizeCounter(parsed.wrongToday)
    };
  } catch (error) {
    console.error("Failed to parse dashboard state:", error);
    return {
      lastActiveDate: today,
      streak: 1,
      dailyDate: today,
      questionsAnsweredToday: 0,
      correctToday: 0,
      wrongToday: 0
    };
  }
}

function saveDashboardState() {
  localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dashboardState));
}

function refreshDashboardForToday() {
  const today = getTodayKey();

  if (dashboardState.lastActiveDate !== today) {
    const dayDiff = getDayDifference(dashboardState.lastActiveDate, today);
    dashboardState.streak = dayDiff === 1 ? dashboardState.streak + 1 : 1;
    dashboardState.lastActiveDate = today;
  }

  if (dashboardState.dailyDate !== today) {
    dashboardState.dailyDate = today;
    dashboardState.questionsAnsweredToday = 0;
    dashboardState.correctToday = 0;
    dashboardState.wrongToday = 0;
  }

  saveDashboardState();
}

function render() {
  renderDashboard();
  renderStats();
  renderLibrary();
}

function renderDashboard() {
  streakValue.textContent = String(dashboardState.streak);
  successRateValue.textContent = `${calculateDailySuccessRate()}%`;
  answeredTodayValue.textContent = String(dashboardState.questionsAnsweredToday);
}

function renderStats() {
  dueCount.textContent = String(getDueItems().length);
  itemsCount.textContent = String(items.length);
  nextReviewLabel.textContent = getClosestReviewLabel();
}

function renderLibrary() {
  const entries = getVisibleItems();
  libraryList.innerHTML = "";
  emptyState.classList.toggle("hidden", entries.length > 0);

  entries.forEach((item) => {
    const li = document.createElement("li");
    li.className = "compact-card";
    li.innerHTML = buildCardTemplate(item);
    li.querySelector(".card-question").textContent = item.type === "qa" ? item.question : item.text;
    libraryList.appendChild(li);
  });
}

function buildCardTemplate(item) {
  const tags = [
    `<span class="tag ${isDue(item) ? "due" : ""}">${isDue(item) ? "מוכן עכשיו" : "מתוזמן"}</span>`,
    `<span class="tag">${item.type === "qa" ? "Learning" : "Reminder"}</span>`
  ];

  if (item.type === "qa") {
    tags.push(`<span class="tag">רמה ${clampLevel(item.level)}</span>`);
    tags.push(`<span class="tag">ידע ${formatScore(item.score)}</span>`);
  }

  const gradeActions = item.type === "qa" && isDue(item)
    ? `
      <div class="grade-actions">
        <button class="grade-btn again" type="button" data-action="grade" data-grade-value="again" data-id="${item.id}">לא ידעתי</button>
        <button class="grade-btn hard" type="button" data-action="grade" data-grade-value="hard" data-id="${item.id}">קשה</button>
        <button class="grade-btn good" type="button" data-action="grade" data-grade-value="good" data-id="${item.id}">טוב</button>
        <button class="grade-btn easy" type="button" data-action="grade" data-grade-value="easy" data-id="${item.id}">קל</button>
      </div>
    `
    : "";

  const primaryAction = item.type === "qa"
    ? (isDue(item)
      ? `<button class="primary-btn compact-btn" type="button" data-action="review" data-id="${item.id}">ענה</button>`
      : `<button class="ghost-btn compact-btn" type="button" disabled>ממתין</button>`)
    : `<button class="ghost-btn compact-btn" type="button" disabled>${isDue(item) ? "מופיע עכשיו" : "ממתין"}</button>`;

  return `
    <div class="card-top">
      <div class="tag-row">${tags.join("")}</div>
      <div class="card-actions">
        <button class="secondary-btn compact-btn" type="button" data-action="edit" data-id="${item.id}">עריכה</button>
        <button class="delete-btn compact-btn" type="button" data-action="delete" data-id="${item.id}">מחיקה</button>
      </div>
    </div>
    <p class="card-question"></p>
    ${gradeActions}
    <div class="card-bottom">
      <span class="card-meta">הופעה הבאה: ${formatNextReview(item.nextReviewDate)}</span>
      ${primaryAction}
    </div>
  `;
}

function getVisibleItems() {
  const searchValue = normalizeText(searchInput.value);
  const filteredByType = items.filter((item) => item.type === activeLibraryTab);
  const filtered = filteredByType.filter((item) => {
    if (!searchValue) {
      return true;
    }

    const source = item.type === "qa" ? `${item.question} ${item.answer}` : item.text;
    return normalizeText(source).includes(searchValue);
  });

  return filtered.sort((left, right) => {
    if (sortInput.value === "date") {
      return left.createdAt - right.createdAt;
    }

    return left.nextReviewDate - right.nextReviewDate;
  });
}

function getDueItems() {
  const now = Date.now();
  return items.filter((item) => item.nextReviewDate <= now);
}

function getDueQaItems() {
  return getDueItems().filter((item) => item.type === "qa");
}

function isDue(item) {
  return item.nextReviewDate <= Date.now();
}

function getClosestReviewLabel() {
  if (items.length === 0) {
    return "אין פריטים";
  }

  const nextTimestamp = items.reduce((closest, item) => {
    return item.nextReviewDate < closest ? item.nextReviewDate : closest;
  }, items[0].nextReviewDate);

  return formatNextReview(nextTimestamp);
}

function startReviewLoop() {
  if (checkTimerId) {
    clearInterval(checkTimerId);
  }

  checkTimerId = setInterval(() => {
    refreshDashboardForToday();
    render();
    openDueReviewIfNeeded();
  }, CHECK_INTERVAL_MS);
}

function openDueReviewIfNeeded() {
  if (!reviewModal.classList.contains("hidden")) {
    return;
  }

  const dueItem = getDueQaItems().find((item) => !shownReminderKeys.has(getReminderWindowKey(item)));
  if (!dueItem) {
    return;
  }

  shownReminderKeys.add(getReminderWindowKey(dueItem));
  openReview(dueItem);
}

function getReminderWindowKey(item) {
  return `${item.id}:${item.nextReviewDate}`;
}

function openReview(item) {
  if (item.type !== "qa" || !isDue(item)) {
    return;
  }

  activeReviewId = item.id;
  reviewQuestion.textContent = item.question;
  reviewAnswerInput.value = "";
  setFeedback("");
  reviewModal.classList.remove("hidden");
  showSystemNotification(item.question);
}

function closeReview() {
  activeReviewId = null;
  reviewModal.classList.add("hidden");
  reviewAnswerInput.value = "";
  setFeedback("");
}

function submitReview() {
  const item = items.find((entry) => entry.id === activeReviewId);
  if (!item || item.type !== "qa") {
    closeReview();
    return;
  }

  if (!normalizeText(reviewAnswerInput.value)) {
    setFeedback("נסה שוב ❌", "warning");
    return;
  }

  const result = checkAnswer(reviewAnswerInput.value, item.answer);
  setFeedback(result.isCorrect ? "נכון ✔ עכשיו בחר רמת קושי." : "נסה שוב ❌", result.isCorrect ? "success" : "warning");
}

function revealAnswer() {
  const item = items.find((entry) => entry.id === activeReviewId);
  if (!item || item.type !== "qa") {
    return;
  }

  setFeedback(`התשובה השמורה: ${item.answer}`, "warning");
}

function checkAnswer(userInput, storedAnswer) {
  const normalizedUser = normalizeText(userInput);
  const acceptedAnswers = storedAnswer
    .split(/[\/,]/)
    .map((entry) => normalizeText(entry))
    .filter(Boolean);

  const isCorrect = acceptedAnswers.some((answer) => {
    if (normalizedUser === answer) {
      return true;
    }

    return calculateSimilarity(normalizedUser, answer) >= SIMILARITY_THRESHOLD;
  });

  return { isCorrect };
}

function calculateSimilarity(first, second) {
  if (!first || !second) {
    return 0;
  }

  const distance = levenshteinDistance(first, second);
  const longest = Math.max(first.length, second.length);
  return longest === 0 ? 1 : 1 - distance / longest;
}

function levenshteinDistance(first, second) {
  const matrix = Array.from({ length: first.length + 1 }, () => Array(second.length + 1).fill(0));

  for (let row = 0; row <= first.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= second.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= first.length; row += 1) {
    for (let column = 1; column <= second.length; column += 1) {
      const cost = first[row - 1] === second[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[first.length][second.length];
}

function applyGradeToActiveItem(grade) {
  const item = items.find((entry) => entry.id === activeReviewId);
  if (!item) {
    return;
  }

  applyGradeToItem(item, grade);
  setFeedback(GRADE_RULES[grade].label, "success");
  window.setTimeout(closeReview, 800);
}

function applyGradeToItem(item, grade) {
  const rule = GRADE_RULES[grade];
  if (!item || item.type !== "qa" || !rule) {
    return;
  }

  item.level = rule.level;
  updateKnowledgeScore(item, grade);
  updateDailyStats(grade);
  item.nextReviewDate = Date.now() + rule.delayMs;
  saveItems();
  saveDashboardState();
  render();
}

function updateKnowledgeScore(item, grade) {
  if (grade === "good" || grade === "easy") {
    item.correctCount = normalizeCounter(item.correctCount) + 1;
  } else {
    item.wrongCount = normalizeCounter(item.wrongCount) + 1;
  }

  item.score = normalizeScore(item.correctCount, item.wrongCount);
}

function updateDailyStats(grade) {
  refreshDashboardForToday();
  dashboardState.questionsAnsweredToday += 1;

  if (grade === "good" || grade === "easy") {
    dashboardState.correctToday += 1;
  } else {
    dashboardState.wrongToday += 1;
  }
}

function calculateDailySuccessRate() {
  const total = dashboardState.correctToday + dashboardState.wrongToday;
  return total === 0 ? 0 : Math.round((dashboardState.correctToday / total) * 100);
}

function startEditing(item) {
  editingIdInput.value = item.id;
  itemTypeInput.value = item.type;

  if (item.type === "qa") {
    questionInput.value = item.question;
    answerInput.value = item.answer;
    reminderTextInput.value = "";
    reminderDateInput.value = "";
  } else {
    questionInput.value = "";
    answerInput.value = "";
    reminderTextInput.value = item.text;
    reminderDateInput.value = toDateTimeLocalValue(item.nextReviewDate);
  }

  formTitle.textContent = "עריכת פריט קיים";
  submitButton.textContent = "שמור שינויים";
  cancelEditButton.classList.remove("hidden");
  updateFormTypeUI();
}

function resetFormState() {
  form.reset();
  editingIdInput.value = "";
  itemTypeInput.value = "qa";
  formTitle.textContent = "הוסף פריט ל-MemoLoop";
  submitButton.textContent = "שמור ב-MemoLoop";
  cancelEditButton.classList.add("hidden");
  questionInput.value = "";
  answerInput.value = "";
  reminderTextInput.value = "";
  reminderDateInput.value = "";
  updateFormTypeUI();
}

function deleteItem(itemId) {
  items = items.filter((item) => item.id !== itemId);
  saveItems();
  render();

  if (editingIdInput.value === itemId) {
    resetFormState();
  }

  if (activeReviewId === itemId) {
    closeReview();
  }
}

function updateFormTypeUI() {
  const isQa = itemTypeInput.value === "qa";
  qaFields.classList.toggle("hidden", !isQa);
  reminderFields.classList.toggle("hidden", isQa);

  formTypeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.formType === itemTypeInput.value);
  });

  questionInput.required = isQa;
  answerInput.required = isQa;
  reminderTextInput.required = !isQa;
  reminderDateInput.required = !isQa;
}

function updateLibraryTabs() {
  libraryTabButtons.forEach((button) => {
    const active = button.dataset.libraryTab === activeLibraryTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function normalizeCounter(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
}

function normalizeScore(correctCount, wrongCount) {
  const correct = normalizeCounter(correctCount);
  const wrong = normalizeCounter(wrongCount);
  const total = correct + wrong;
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}

function formatScore(score) {
  const numeric = Number(score);
  return `${Number.isFinite(numeric) ? numeric : 0}%`;
}

function clampLevel(level) {
  const numeric = Number(level);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.min(3, Math.max(0, numeric));
}

function formatNextReview(timestamp) {
  if (timestamp <= Date.now()) {
    return "מוכן עכשיו";
  }

  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp);
}

function normalizeText(value) {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function setFeedback(message, tone = "") {
  reviewFeedback.textContent = message;
  reviewFeedback.className = "review-feedback";
  if (tone) {
    reviewFeedback.classList.add(tone);
  }
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDayDifference(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function toDateTimeLocalValue(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch((error) => {
      console.error("Notification permission request failed:", error);
    });
  }
}

function showSystemNotification(message) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const notification = new Notification("MemoLoop", { body: message });
  notification.onclick = () => window.focus();
}

function loadTheme() {
  const storedTheme = localStorage.getItem(THEME_KEY);
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  themeToggle.textContent = theme === "dark" ? "מצב בהיר" : "מצב כהה";
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  applyTheme(document.body.classList.contains("dark") ? "light" : "dark");
}
