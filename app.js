const state = {
    wsUrl: "wss://://derivws.com",
    appId: "36544", 
    ws: null,
    authorized: false,
    
    activeAccountType: 'demo',
    demoToken: localStorage.getItem('deriv_demo_token') || '',
    realToken: localStorage.getItem('deriv_real_token') || '',
    currentBalance: 0.00,
    
    activeSymbol: 'R_10',
    stakeAmount: 10,
    targetProfit: 200,
    stopLoss: 999,
    martingaleMultiplier: 2.0,
    initialStake: 10,
    accumulatedProfit: 0,
    
    executionMode: 'manual',
    isBotRunning: false,
    
    tickHistory: [],
    maxHistoryLength: 50,
    
    isOrderProcessing: false,
    lastContractId: null
};

const symbolMap = {
    'Volatility 10 (1s) Index': '1HZ10V',
    'Volatility 10 Index': 'R_10',
    'Volatility 15 (1s) Index': '1HZ15V',
    'Volatility 25 (1s) Index': '1HZ25V',
    'Volatility 25 Index': 'R_25',
    'Volatility 50 (1s) Index': '1HZ50V',
    'Volatility 50 Index': 'R_50',
    'Volatility 75 (1s) Index': '1HZ75V',
    'Volatility 75 Index': 'R_75',
    'Volatility 100 (1s) Index': '1HZ100V',
    'Volatility 100 Index': 'R_100'
};

let priceChart = null;

document.addEventListener("DOMContentLoaded", () => {
    if(state.demoToken) document.getElementById('demoTokenInput').value = state.demoToken;
    if(state.realToken) document.getElementById('realTokenInput').value = state.realToken;
    initializeUIEventListeners();
    initializeChart();
    connectWebSocket();
});

function connectWebSocket() {
    if (state.ws) state.ws.close();
    state.ws = new WebSocket(`${state.wsUrl}${state.appId}`);
    state.ws.onopen = () => {
        const activeToken = state.activeAccountType === 'real' ? state.realToken : state.demoToken;
        if (activeToken) sendSocketPayload({ authorize: activeToken });
        else subscribeToMarketTicks();
    };
    state.ws.onmessage = (event) => handleIncomingSocketPayload(JSON.parse(event.data));
}

function sendSocketPayload(obj) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(obj));
}

function handleIncomingSocketPayload(data) {
    switch (data.msg_type) {
        case 'authorize':
            if (data.error) {
                state.authorized = false;
                subscribeToMarketTicks();
            } else {
                state.authorized = true;
                updateBalanceDisplay(data.authorize.balance);
                subscribeToMarketTicks();
            }
            break;
        case 'tick':
            if (data.tick) processIncomingMarketTick(data.tick);
            break;
        case 'buy':
            if (!data.error) {
                state.lastContractId = data.buy.contract_id;
                sendSocketPayload({ proposal_open_contract: 1, contract_id: state.lastContractId, subscribe: 1 });
            } else {
                state.isOrderProcessing = false;
            }
            break;
        case 'proposal_open_contract':
            if (data.proposal_open_contract) evaluateOpenContractMetrics(data.proposal_open_contract);
            break;
    }
}

function subscribeToMarketTicks() {
    sendSocketPayload({ ticks: state.activeSymbol, subscribe: 1 });
}

function processIncomingMarketTick(tickData) {
    if (tickData.symbol !== state.activeSymbol) return;
    const rawQuote = parseFloat(tickData.quote);
    const quoteString = tickData.quote.toString();
    const lastDigit = parseInt(quoteString.charAt(quoteString.length - 1));

    state.tickHistory.push(rawQuote);
    if (state.tickHistory.length > state.maxHistoryLength) state.tickHistory.shift();

    pushDataPointToUIChart(tickData.epoch, rawQuote);
    document.getElementById("currentPriceDisplay").innerText = rawQuote;
    if (!isNaN(lastDigit)) updatePipelineStatistics(lastDigit);
}

function updatePipelineStatistics(newestDigit) {
    const sampleHistory = state.tickHistory.slice(-state.maxHistoryLength);
    const counts = Array(10).fill(0);
    sampleHistory.forEach(p => {
        const str = p.toString();
        const d = parseInt(str.charAt(str.length - 1));
        if (!isNaN(d)) counts[d]++;
    });
    const total = sampleHistory.length || 1;
    for (let i = 0; i < 10; i++) {
        const pct = ((counts[i] / total) * 100).toFixed(1);
        document.getElementById(`pct-${i}`).innerText = `${pct}%`;
        const bubble = document.getElementById(`bubble-${i}`);
        bubble.classList.remove('active-tick');
        if (i === newestDigit) bubble.classList.add('active-tick');
    }
    if (state.executionMode === 'auto' && state.isBotRunning) evaluateAutomatedBotStrategy(newestDigit);
}

function executeBinaryTradeContract(type) {
    if (!state.authorized || state.isOrderProcessing) return;
    state.isOrderProcessing = true;
    sendSocketPayload({
        buy: 1,
        price: parseFloat(state.stakeAmount),
        parameters: {
            amount: parseFloat(state.stakeAmount),
            basis: "stake",
            contract_type: type === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD',
            currency: "USD",
            duration: 1,
            duration_unit: "t",
            symbol: state.activeSymbol
        }
    });
}

function evaluateOpenContractMetrics(contract) {
    if (contract.status === 'won' || contract.status === 'lost') {
        const profit = parseFloat(contract.profit);
        updateBalanceDisplay(parseFloat(state.currentBalance) + profit);
        sendSocketPayload({ forget: contract.id });
        if (state.executionMode === 'auto' && state.isBotRunning) {
            state.accumulatedProfit += profit;
            if (state.accumulatedProfit >= state.targetProfit || state.accumulatedProfit <= -state.stopLoss) {
                state.isBotRunning = false;
                alert("Risk safety boundaries hit. Automation loop paused.");
            } else if (contract.status === 'lost') {
                state.stakeAmount = (state.stakeAmount * state.martingaleMultiplier).toFixed(2);
                document.getElementById("stakeInputDisplay").innerText = state.stakeAmount;
            } else {
                state.stakeAmount = state.initialStake;
                document.getElementById("stakeInputDisplay").innerText = state.stakeAmount;
            }
        }
        state.isOrderProcessing = false;
    }
}

function evaluateAutomatedBotStrategy(digit) {
    if (state.isOrderProcessing) return;
    executeBinaryTradeContract(digit % 2 === 0 ? 'EVEN' : 'ODD');
}

function initializeUIEventListeners() {
    document.getElementById("assetSelectionDisplayRow").addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("marketScrollOverlayMenu").classList.toggle("active");
    });
    document.querySelectorAll(".market-option-row").forEach(row => {
        row.addEventListener("click", function() {
            document.querySelectorAll(".market-option-row").forEach(r => r.classList.remove('selected'));
            this.classList.add('selected');
            const name = this.getAttribute("data-asset-name");
            document.getElementById("activeAssetNameLabel").innerText = name;
            sendSocketPayload({ forget_all: "ticks" });
            state.activeSymbol = symbolMap[name];
            state.tickHistory = [];
            subscribeToMarketTicks();
        });
    });
    document.getElementById("accountTypeDropdownToggle").addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("accountDropdownMenu").classList.toggle("active");
    });
    document.querySelectorAll("#accountDropdownMenu .dropdown-item").forEach(item => {
        item.addEventListener("click", function() {
            state.activeAccountType = this.getAttribute("data-acc");
            const ind = document.getElementById("headerAccountTypeIndicator");
            ind.innerText = state.activeAccountType === 'real' ? 'R' : 'D';
            ind.className = "account-type-indicator " + (state.activeAccountType === 'real' ? 'real-style' : '');
            connectWebSocket();
        });
    });
    document.getElementById("menuToggleBtn").addEventListener("click", () => document.getElementById("menuDrawer").classList.add("open"));
    document.getElementById("closeDrawerBtn").addEventListener("click", () => document.getElementById("menuDrawer").classList.remove("open"));
    document.getElementById("openDepositModalBtn").addEventListener("click", () => document.getElementById("depositModal").classList.add("active"));
    document.getElementById("closeDepositBtn").addEventListener("click", () => document.getElementById("depositModal").classList.remove("active"));
    document.getElementById("navPositions").addEventListener("click", () => document.getElementById("positionsModal").classList.add("active"));
    document.getElementById("closePositionsBtn").addEventListener("click", () => document.getElementById("positionsModal").classList.remove("active"));
    document.getElementById("saveTokensBtn").addEventListener("click", () => {
        state.demoToken = document.getElementById("demoTokenInput").value.trim();
        state.realToken = document.getElementById("realTokenInput").value.trim();
        localStorage.setItem('deriv_demo_token', state.demoToken);
        localStorage.setItem('deriv_real_token', state.realToken);
        document.getElementById("menuDrawer").classList.remove("open");
        connectWebSocket();
    });
    document.getElementById("btnStakeMinus").addEventListener("click", () => { if(state.stakeAmount > 1) { state.stakeAmount--; updateStakeUI(); } });
    document.getElementById("btnStakePlus").addEventListener("click", () => { state.stakeAmount++; updateStakeUI(); });
    document.querySelectorAll(".stake-chip").forEach(chip => {
        chip.addEventListener("click", function() {
            document.querySelectorAll(".stake-chip").forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
          
