// ===========================================================
// Config
// ===========================================================
const API_BASE = "http://127.0.0.1:2200";
const PREDICT_URL = `${API_BASE}/predict`;
const SCORE_MAX = 10; // gauge scale for predicted_mental_health_score

// ===========================================================
// Elements
// ===========================================================
const form = document.getElementById("predict-form");
const submitBtn = document.getElementById("submit-btn");
const formError = document.getElementById("form-error");

const states = {
  idle: document.getElementById("state-idle"),
  loading: document.getElementById("state-loading"),
  result: document.getElementById("state-result"),
  error: document.getElementById("state-error"),
};

const scoreValueEl = document.getElementById("score-value");
const dialFillEl = document.getElementById("dial-fill");
const resultCopyEl = document.getElementById("result-copy");
const errorCopyEl = document.getElementById("error-copy");

const resetBtn = document.getElementById("reset-btn");
const retryBtn = document.getElementById("retry-btn");

// ===========================================================
// State switching
// ===========================================================
function showState(name) {
  Object.entries(states).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

// ===========================================================
// Gauge helpers
// ===========================================================
// prepare dashoffset once the path is in the DOM
function primeDial() {
  const len = dialFillEl.getTotalLength();
  dialFillEl.style.strokeDasharray = `${len}`;
  dialFillEl.style.strokeDashoffset = `${len}`;
  return len;
}

function colorForScore(score) {
  const pct = score / SCORE_MAX;
  if (pct >= 0.66) return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  if (pct >= 0.4) return getComputedStyle(document.documentElement).getPropertyValue("--amber").trim();
  return getComputedStyle(document.documentElement).getPropertyValue("--rose").trim();
}

function animateDialTo(score) {
  const clamped = Math.max(0, Math.min(SCORE_MAX, score));
  const len = primeDial();
  const fraction = clamped / SCORE_MAX;

  // force reflow so the transition reliably fires after resetting dashoffset
  // eslint-disable-next-line no-unused-expressions
  dialFillEl.getBoundingClientRect();

  dialFillEl.style.stroke = colorForScore(clamped);
  requestAnimationFrame(() => {
    dialFillEl.style.strokeDashoffset = `${len * (1 - fraction)}`;
  });
}

// ===========================================================
// Validation (mirrors StudentData constraints)
// ===========================================================
function collectAndValidate() {
  const errors = [];

  const age = Number(form.age.value);
  if (!form.age.value || age < 10 || age > 100) errors.push("Age must be between 10 and 100.");

  const gender = form.gender.value;
  if (!gender) errors.push("Please choose a gender.");

  const country = form.country.value.trim();
  if (!country) errors.push("Please type your country.");

  const academic_level = form.academic_level.value;
  if (!academic_level) errors.push("Please choose an academic level.");

  const most_used_platform = form.most_used_platform.value;
  if (!most_used_platform) errors.push("Please choose a most-used platform.");

  const purpose_of_use = form.purpose_of_use.value;
  if (!purpose_of_use) errors.push("Please choose a purpose of use.");

  const avg_daily_usage_hours = Number(form.avg_daily_usage_hours.value);
  if (form.avg_daily_usage_hours.value === "" || avg_daily_usage_hours < 0 || avg_daily_usage_hours > 24)
    errors.push("Daily usage hours must be between 0 and 24.");

  const daily_unlocks = Number(form.daily_unlocks.value);
  if (form.daily_unlocks.value === "" || daily_unlocks < 0)
    errors.push("Daily unlocks can't be negative.");

  const study_hours = Number(form.study_hours.value);
  if (form.study_hours.value === "" || study_hours < 0 || study_hours > 24)
    errors.push("Study hours must be between 0 and 24.");

  const physical_activity_hours = Number(form.physical_activity_hours.value);
  if (form.physical_activity_hours.value === "" || physical_activity_hours < 0 || physical_activity_hours > 24)
    errors.push("Physical activity hours must be between 0 and 24.");

  const sleep_hours_per_night = Number(form.sleep_hours_per_night.value);
  if (form.sleep_hours_per_night.value === "" || sleep_hours_per_night < 0 || sleep_hours_per_night > 24)
    errors.push("Sleep hours must be between 0 and 24.");

  const stress_level = form.stress_level.value;
  if (!stress_level) errors.push("Please choose a stress level.");

  const payload = {
    age,
    gender,
    country,
    academic_level,
    most_used_platform,
    purpose_of_use,
    avg_daily_usage_hours,
    daily_unlocks,
    study_hours,
    physical_activity_hours,
    sleep_hours_per_night,
    stress_level,
  };

  return { errors, payload };
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function clearFormError() {
  formError.hidden = true;
  formError.textContent = "";
}

// ===========================================================
// API call
// ===========================================================
async function callPredict(payload) {
  let response;
  try {
    response = await fetch(PREDICT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw new Error(
      "Couldn't reach the API. Make sure it's running with: uvicorn main:app --port 2200 --reload"
    );
  }

  if (!response.ok) {
    let detailMsg = `Request failed (status ${response.status}).`;
    try {
      const body = await response.json();
      if (Array.isArray(body?.detail)) {
        detailMsg = body.detail
          .map((d) => `${(d.loc || []).slice(-1)[0] || "field"}: ${d.msg}`)
          .join(" · ");
      } else if (typeof body?.detail === "string") {
        detailMsg = body.detail;
      }
    } catch (_) {
      /* body wasn't JSON — keep default message */
    }
    throw new Error(detailMsg);
  }

  return response.json();
}

// ===========================================================
// Result copy
// ===========================================================
function copyForScore(score) {
  const pct = score / SCORE_MAX;
  if (pct >= 0.66) return "On the higher end of the scale, based on what you shared.";
  if (pct >= 0.4) return "Sitting in the middle of the scale, based on what you shared.";
  return "On the lower end of the scale, based on what you shared.";
}

// ===========================================================
// Submit handler
// ===========================================================
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFormError();

  const { errors, payload } = collectAndValidate();
  if (errors.length > 0) {
    showFormError(errors[0]);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add("is-loading");
  showState("loading");

  try {
    const data = await callPredict(payload);
    const score = Number(data.predicted_mental_health_score);

    showState("result");
    scoreValueEl.textContent = score.toFixed(2);
    resultCopyEl.textContent = copyForScore(score);
    animateDialTo(score);
  } catch (err) {
    showState("error");
    errorCopyEl.textContent = err.message || "Something went wrong. Please try again.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove("is-loading");
  }
});

// ===========================================================
// Reset / retry
// ===========================================================
resetBtn.addEventListener("click", () => {
  form.reset();
  clearFormError();
  showState("idle");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

retryBtn.addEventListener("click", () => {
  showState("idle");
});

// prime the dial paths on load so transitions behave on first run
window.addEventListener("load", primeDial);
