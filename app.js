/* =========================================================
   KRISHWAVE FREE PREDICTION AI
   Standalone paper/demo engine
   No Deriv login
   No API key
   No real-money trading
========================================================= */

const START_BALANCE = 1000;

const state = {
  balance: Number(localStorage.getItem("kw_balance")) || START_BALANCE,
  price: 9448.98,
  previousPrice: 9448.98,

  digits: [],
  priceHistory: [],

  contract: "matches",
  mode: "auto",

  prediction: null,

  trades: JSON.parse(
    localStorage.getItem("kw_trades") || "[]"
  ),

  stats: {
    wins: 0,
    losses: 0,
    total: 0
  },

  nextTick: 0
};

/* =========================================================
   ELEMENTS
========================================================= */

const $ = id => document.getElementById(id);

const balanceEl = $("balance");
const priceEl = $("price");
const changeEl = $("change");
const digitGrid = $("digitGrid");
const predictionText = $("predictionText");
const confidenceEl = $("confidence");
const predictedDigitEl = $("predictedDigit");
const signalEl = $("signal");
const strategyEl = $("strategy");
const lastDigitEl = $("lastDigit");
const countdownEl = $("countdown");
const winRateEl = $("winRate");

const chartCanvas = $("chart");
const ctx = chartCanvas.getContext("2d");

/* =========================================================
   INITIAL DIGITS
========================================================= */

function randomDigit() {
  return Math.floor(Math.random() * 10);
}

function initializeHistory() {
  for (let i = 0; i < 120; i++) {
    state.digits.push(randomDigit());
  }

  state.priceHistory.push(state.price);

  for (let i = 0; i < 80; i++) {
    state.priceHistory.push(
      state.price + (Math.random() - .5) * 8
    );
  }
}

/* =========================================================
   LOCAL STORAGE
========================================================= */

function saveState() {
  localStorage.setItem(
    "kw_balance",
    state.balance.toFixed(2)
  );

  localStorage.setItem(
    "kw_trades",
    JSON.stringify(state.trades.slice(0, 100))
  );
}

/* =========================================================
   PRICE / DIGIT SIMULATION
========================================================= */

function tick() {

  state.previousPrice = state.price;

  const movement =
    (Math.random() - .5) *
    (Math.random() > .85 ? 2.5 : 1);

  state.price += movement;

  state.price = Number(state.price.toFixed(2));

  const digit =
    Number(
      String(Math.floor(Math.abs(state.price * 100)))
        .slice(-1)
    );

  state.digits.push(digit);

  if (state.digits.length > 300) {
    state.digits.shift();
  }

  state.priceHistory.push(state.price);

  if (state.priceHistory.length > 100) {
    state.priceHistory.shift();
  }

  settlePrediction(digit);

  state.nextTick = 1;

  updateUI();
}

/* =========================================================
   DIGIT ANALYSIS
========================================================= */

function digitFrequency(windowSize = 100) {

  const data =
    state.digits.slice(-windowSize);

  const counts = Array(10).fill(0);

  data.forEach(d => counts[d]++);

  return counts.map(
    n => n / Math.max(data.length, 1)
  );
}

function transitionScore() {

  const data = state.digits.slice(-120);

  if (data.length < 5) return 50;

  let matches = 0;

  for (let i = 1; i < data.length; i++) {
    if (data[i] === data[i - 1]) {
      matches++;
    }
  }

  return Math.round(
    100 * matches / (data.length - 1)
  );
}

function calculateEntropy() {

  const freq = digitFrequency(50);

  let entropy = 0;

  freq.forEach(p => {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  });

  return Math.round(
    (entropy / Math.log2(10)) * 100
  );
}

function predictionEngine() {

  const w20 = digitFrequency(20);
  const w50 = digitFrequency(50);
  const w100 = digitFrequency(100);
  const w200 = digitFrequency(200);

  const scores = [];

  for (let d = 0; d < 10; d++) {

    let score =
      w20[d] * .40 +
      w50[d] * .28 +
      w100[d] * .20 +
      w200[d] * .12;

    scores.push(score);
  }

  let bestDigit = 0;

  for (let d = 1; d < 10; d++) {
    if (scores[d] > scores[bestDigit]) {
      bestDigit = d;
    }
  }

  const sorted =
    [...scores].sort((a, b) => b - a);

  const edge =
    sorted[0] - sorted[1];

  const entropy = calculateEntropy();

  const stability =
    Math.max(0, 100 - Math.abs(50 - entropy));

  let confidence =
    55 +
    edge * 150 +
    stability * .15;

  confidence =
    Math.round(
      Math.min(94, Math.max(52, confidence))
    );

  let strategy;

  if (bestDigit >= 5) {
    strategy = "OVER";
  } else {
    strategy = "UNDER";
  }

  const even =
    bestDigit % 2 === 0;

  const match =
    bestDigit === state.digits[state.digits.length - 1];

  return {
    digit: bestDigit,
    confidence,
    strategy,
    even,
    match,
    entropy,
    stability,
    transition: transitionScore()
  };
}

/* =========================================================
   CREATE PREDICTION
========================================================= */

function createPrediction() {

  const p = predictionEngine();

  state.prediction = {
    ...p,
    createdAt: Date.now(),
    entryDigit: null,
    active: false
  };

  predictionText.textContent =
    `${p.strategy} → DIGIT ${p.digit}`;

  confidenceEl.textContent =
    `${p.confidence}%`;

  predictedDigitEl.textContent =
    p.digit;

  signalEl.textContent =
    p.confidence >= 68
      ? "SIGNAL"
      : "WAIT";

  strategyEl.textContent =
    p.strategy;

  $("stability").textContent =
    `${Math.round(p.stability)}%`;

  $("support").textContent =
    `${Math.round(p.confidence)}%`;

  $("transition").textContent =
    `${p.transition}%`;

  $("entropy").textContent =
    `${p.entropy}%`;
}

/* =========================================================
   SETTLE AI PREDICTION
========================================================= */

function settlePrediction(currentDigit) {

  if (!state.prediction) return;

  if (!state.prediction.active) return;

  const trade = state.prediction;

  const strategy = trade.strategy;

  let win = false;

  if (strategy === "OVER") {
    win = currentDigit > 4;
  }

  if (strategy === "UNDER") {
    win = currentDigit < 5;
  }

  if (strategy === "EVEN") {
    win = currentDigit % 2 === 0;
  }

  if (strategy === "ODD") {
    win = currentDigit % 2 !== 0;
  }

  if (strategy === "MATCHES") {
    win = currentDigit === trade.digit;
  }

  if (strategy === "DIFFERS") {
    win = currentDigit !== trade.digit;
  }

  settleTrade(
    trade.stake,
    strategy,
    trade.digit,
    currentDigit,
    win
  );

  state.prediction.active = false;
}

/* =========================================================
   SETTLE TRADE
========================================================= */

function settleTrade(
  stake,
  strategy,
  predicted,
  actual,
  win
) {

  const payoutRate = 0.952;

  state.stats.total++;

  let profit;

  if (win) {

    profit = stake * payoutRate;

    state.balance += profit;

    state.stats.wins++;

  } else {

    profit = -stake;

    state.balance += profit;

    state.stats.losses++;
  }

  state.trades.unshift({
    time: new Date().toLocaleTimeString(),
    strategy,
    predicted,
    actual,
    stake,
    profit,
    result: win ? "WIN" : "LOSS"
  });

  state.trades =
    state.trades.slice(0, 100);

  saveState();

  renderHistory();
}

/* =========================================================
   MANUAL / AUTO TRADE
========================================================= */

function executeTrade(strategy) {

  const stake =
    Number($("stake").value) || 0;

  if (stake <= 0) {
    alert("Enter a valid stake.");
    return;
  }

  if (stake > state.balance) {
    alert("Insufficient paper balance.");
    return;
  }

  let digit;

  if (state.mode === "manual") {
    digit =
      Number($("manualDigit").value);

    if (
      Number.isNaN(digit) ||
      digit < 0 ||
      digit > 9
    ) {
      alert("Target digit must be 0–9.");
      return;
    }
  } else {
    if (!state.prediction) {
      createPrediction();
    }

    digit =
      state.prediction.digit;
  }

  state.balance -= stake;

  state.prediction = {
    ...(state.prediction || {}),
    strategy,
    digit,
    stake,
    active: true
  };

  updateBalance();
}

/* =========================================================
   CONTRACT BUTTONS
========================================================= */

function renderTradeButtons() {

  const box = $("tradeButtons");

  box.innerHTML = "";

  let buttons = [];

  if (state.contract === "matches") {

    buttons = [
      {
        name: "Matches",
        strategy: "MATCHES",
        class: "green"
      },
      {
        name: "Differs",
        strategy: "DIFFERS",
        class: "red"
      }
    ];

  } else if (state.contract === "evenodd") {

    buttons = [
      {
        name: "Even",
        strategy: "EVEN",
        class: "green"
      },
      {
        name: "Odd",
        strategy: "ODD",
        class: "red"
      }
    ];

  } else {

    buttons = [
      {
        name: "Over",
        strategy: "OVER",
        class: "green"
      },
      {
        name: "Under",
        strategy: "UNDER",
        class: "red"
      }
    ];
  }

  buttons.forEach(btn => {

    const button =
      document.createElement("button");

    button.className =
      `trade-btn ${btn.class}`;

    button.innerHTML = `
      <span class="trade-name">
        ${btn.name}
      </span>

      <span class="payout">
        $19.52
        &nbsp; 95.20%
        Payout
      </span>
    `;

    button.onclick = () =>
      executeTrade(btn.strategy);

    box.appendChild(button);
  });
}

/* =========================================================
   DIGIT DISPLAY
========================================================= */

function renderDigits() {

  const freq =
    digitFrequency(100);

  digitGrid.innerHTML = "";

  const highest =
    Math.max(...freq);

  freq.forEach((value, digit) => {

    const box =
      document.createElement("div");

    box.className =
      "digit-box";

    if (value === highest) {
      box.classList.add("hot");
    }

    box.innerHTML = `
      <div class="digit-number">
        ${digit}
      </div>

      <div class="digit-percent">
        ${(value * 100).toFixed(1)}%
      </div>
    `;

    digitGrid.appendChild(box);
  });
}

/* =========================================================
   CHART
========================================================= */

function resizeCanvas() {

  const rect =
    chartCanvas.getBoundingClientRect();

  const ratio =
    window.devicePixelRatio || 1;

  chartCanvas.width =
    rect.width * ratio;

  chartCanvas.height =
    rect.height * ratio;

  ctx.setTransform(
    ratio,
    0,
    0,
    ratio,
    0,
    0
  );
}

function drawChart() {

  resizeCanvas();

  const width =
    chartCanvas.clientWidth;

  const height =
    chartCanvas.clientHeight;

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const data =
    state.priceHistory;

  if (data.length < 2) return;

  const min =
    Math.min(...data);

  const max =
    Math.max(...data);

  const range =
    Math.max(max - min, .01);

  ctx.beginPath();

  data.forEach((value, index) => {

    const x =
      index /
      (data.length - 1) *
      width;

    const y =
      height -
      ((value - min) / range) *
      (height - 15) -
      5;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1769ff";
  ctx.stroke();

  /* current price marker */

  const last =
    data[data.length - 1];

  const y =
    height -
    ((last - min) / range) *
    (height - 15) -
    5;

  ctx.beginPath();

  ctx.arc(
    width - 2,
    y,
    4,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = "#10a66a";
  ctx.fill();
}

/* =========================================================
   UI
========================================================= */

function updateBalance() {

  balanceEl.textContent =
    `$${state.balance.toFixed(2)}`;
}

function updatePrice() {

  priceEl.textContent =
    state.price.toFixed(2);

  const diff =
    state.price -
    state.previousPrice;

  const percent =
    state.previousPrice
      ? (diff / state.previousPrice) * 100
      : 0;

  changeEl.textContent =
    `${diff >= 0 ? "+" : ""}${diff.toFixed(2)} ` +
    `(${percent.toFixed(2)}%) ` +
    `${diff >= 0 ? "↗" : "↘"}`;

  changeEl.style.color =
    diff >= 0
      ? "#10a66a"
      : "#e84d5b";
}

function updateStatus() {

  const last =
    state.digits[state.digits.length - 1];

  lastDigitEl.textContent =
    last;

  if (state.stats.total > 0) {

    const rate =
      state.stats.wins /
      state.stats.total *
      100;

    winRateEl.textContent =
      `${rate.toFixed(1)}%`;

  } else {

    winRateEl.textContent =
      "0%";
  }
}

function updateUI() {

  updateBalance();
  updatePrice();
  updateStatus();
  renderDigits();
  drawChart();
}

/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {

  const box =
    $("historyList");

  if (!state.trades.length) {

    box.innerHTML =
      `<p style="color:#7c8799;font-size:12px">
        No trades yet.
      </p>`;

    return;
  }

  box.innerHTML =
    state.trades
      .slice(0, 20)
      .map(t => `
        <div class="history-row">

          <span>
            ${t.time}
            <br>
            ${t.strategy}
            ${t.predicted !== undefined
              ? " → " + t.predicted
              : ""}
          </span>

          <span>
            Actual: ${t.actual}
          </span>

          <span class="${t.result === "WIN"
            ? "win"
            : "loss"}">

            ${t.result}
            <br>
            ${t.profit >= 0 ? "+" : ""}
            $${t.profit.toFixed(2)}

          </span>

        </div>
      `)
      .join("");
}

/* =========================================================
   SECTION NAVIGATION
========================================================= */

function showSection(section) {

  $("analysisSection")
    .classList.toggle(
      "hidden",
      section !== "analysis"
    );

  $("historySection")
    .classList.toggle(
      "hidden",
      section !== "history"
    );

  document
    .querySelectorAll(".bottom-btn")
    .forEach(btn => {

      btn.classList.toggle(
        "active",
        btn.dataset.section === section
      );
    });
}

document
  .querySelectorAll("[data-section]")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        showSection(
          button.dataset.section
        );

        $("sideMenu")
          .classList.remove("open");
      }
    );
  });

/* =========================================================
   CONTRACT SELECTION
========================================================= */

document
  .querySelectorAll(".contract-tab")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(".contract-tab")
          .forEach(b =>
            b.classList.remove("active")
          );

        button.classList.add("active");

        state.contract =
          button.dataset.contract;

        renderTradeButtons();
      }
    );
  });

/* =========================================================
   AUTO / MANUAL
========================================================= */

$("autoBtn").onclick = () => {

  state.mode = "auto";

  $("autoBtn")
    .classList.add("active");

  $("manualBtn")
    .classList.remove("active");

  $("manualTargetBox")
    .classList.add("hidden");
};

$("manualBtn").onclick = () => {

  state.mode = "manual";

  $("manualBtn")
    .classList.add("active");

  $("autoBtn")
    .classList.remove("active");

  $("manualTargetBox")
    .classList.remove("hidden");
};

/* =========================================================
   AI BUTTON
========================================================= */

$("usePrediction").onclick = () => {

  createPrediction();

  $("manualDigit").value =
    state.prediction.digit;
};

/* =========================================================
   STAKE BUTTONS
========================================================= */

document
  .querySelectorAll("[data-stake]")
  .forEach(button => {

    button.onclick = () => {

      $("stake").value =
        button.dataset.stake;
    };
  });

/* =========================================================
   MARKET
========================================================= */

$("marketSelect").onchange = e => {

  $("marketName").textContent =
    e.target.value;
};

/* =========================================================
   MENU
========================================================= */

$("menuBtn").onclick = () => {

  $("sideMenu")
    .classList.add("open");
};

$("closeMenu").onclick = () => {

  $("sideMenu")
    .classList.remove("open");
};

/* =========================================================
   COUNTDOWN
========================================================= */

setInterval(() => {

  state.nextTick =
    Math.max(0, state.nextTick - .1);

  countdownEl.textContent =
    `${state.nextTick.toFixed(1)}s`;

}, 100);

/* =========================================================
   TICK LOOP
========================================================= */

setInterval(() => {

  tick();

  /*
    Generate a fresh AI analysis after
    every new simulated tick.
  */

  createPrediction();

}, 1000);

/* =========================================================
   INIT
========================================================= */

initializeHistory();

createPrediction();

renderTradeButtons();

renderHistory();

updateUI();

window.addEventListener(
  "resize",
  drawChart
);
