class WebAssets {
  static const String indexHtml = '''
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bestia - Partita Live</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>🃏 Bestia - Partita Live</h1>
            <div class="status" id="status">
                <span class="status-dot"></span>
                <span id="statusText">Connessione...</span>
            </div>
        </header>

        <div class="game-info">
            <div class="info-card">
                <span class="label">💰 Piatto</span>
                <span class="value" id="pot">0.00€</span>
            </div>
            <div class="info-card">
                <span class="label">🎲 Fase</span>
                <span class="value" id="phase">-</span>
            </div>
            <div class="info-card">
                <span class="label">👑 Dealer</span>
                <span class="value" id="dealer">-</span>
            </div>
        </div>

        <div class="table-container">
            <table id="scoreTable">
                <thead>
                    <tr>
                        <th>Giocatore</th>
                        <th>Punteggio</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="scoreBody">
                    <tr>
                        <td colspan="3" class="no-data">Caricamento dati...</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="actions">
            <button onclick="showHistory()" class="btn-secondary">📜 Storico</button>
            <button onclick="refreshData()" class="btn-primary">🔄 Aggiorna</button>
        </div>

        <div id="historyModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>📜 Storico Partita</h2>
                    <button onclick="closeHistory()" class="close-btn">&times;</button>
                </div>
                <div class="modal-body" id="historyBody">
                    <p class="no-data">Caricamento...</p>
                </div>
            </div>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>
''';

  static const String stylesCss = '''
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: linear-gradient(135deg, #1a233a 0%, #2d3e50 100%);
    color: #ffffff;
    min-height: 100vh;
    padding: 20px;
}

.container {
    max-width: 800px;
    margin: 0 auto;
}

header {
    text-align: center;
    margin-bottom: 30px;
}

h1 {
    font-size: 2em;
    margin-bottom: 10px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}

.status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255,255,255,0.1);
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 0.9em;
}

.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ff6b6b;
    animation: pulse 2s infinite;
}

.status.connected .status-dot {
    background: #51cf66;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.game-info {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-bottom: 30px;
}

.info-card {
    background: rgba(255,255,255,0.1);
    padding: 20px;
    border-radius: 15px;
    text-align: center;
    backdrop-filter: blur(10px);
}

.info-card .label {
    display: block;
    font-size: 0.9em;
    opacity: 0.8;
    margin-bottom: 8px;
}

.info-card .value {
    display: block;
    font-size: 1.5em;
    font-weight: bold;
}

.table-container {
    background: rgba(255,255,255,0.1);
    border-radius: 15px;
    overflow: hidden;
    margin-bottom: 20px;
    backdrop-filter: blur(10px);
}

table {
    width: 100%;
    border-collapse: collapse;
}

thead {
    background: rgba(0,0,0,0.2);
}

th {
    padding: 15px;
    text-align: left;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.85em;
    letter-spacing: 1px;
}

tbody tr {
    border-bottom: 1px solid rgba(255,255,255,0.1);
    transition: background 0.2s;
}

tbody tr:hover {
    background: rgba(255,255,255,0.05);
}

tbody tr:last-child {
    border-bottom: none;
}

td {
    padding: 15px;
}

.player-name {
    font-weight: 600;
    font-size: 1.1em;
}

.dealer-badge {
    display: inline-block;
    background: #ffd43b;
    color: #1a233a;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.8em;
    font-weight: bold;
    margin-left: 8px;
}

.score {
    font-size: 1.2em;
    font-weight: bold;
}

.score.positive {
    color: #51cf66;
}

.score.negative {
    color: #ff6b6b;
}

.status-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.85em;
    font-weight: 600;
}

.status-badge.winning {
    background: rgba(81, 207, 102, 0.2);
    color: #51cf66;
}

.status-badge.losing {
    background: rgba(255, 107, 107, 0.2);
    color: #ff6b6b;
}

.status-badge.neutral {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
}

.actions {
    display: flex;
    gap: 10px;
    justify-content: center;
}

button {
    padding: 12px 24px;
    border: none;
    border-radius: 10px;
    font-size: 1em;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-primary {
    background: #35654d;
    color: white;
}

.btn-primary:hover {
    background: #2d5440;
    transform: translateY(-2px);
}

.btn-secondary {
    background: rgba(255,255,255,0.1);
    color: white;
}

.btn-secondary:hover {
    background: rgba(255,255,255,0.2);
    transform: translateY(-2px);
}

.no-data {
    text-align: center;
    padding: 40px 20px;
    opacity: 0.6;
    font-style: italic;
}

.modal {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    z-index: 1000;
    padding: 20px;
    overflow-y: auto;
}

.modal.active {
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-content {
    background: #1a233a;
    border-radius: 15px;
    max-width: 600px;
    width: 100%;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
}

.modal-header h2 {
    font-size: 1.5em;
}

.close-btn {
    background: none;
    border: none;
    color: white;
    font-size: 2em;
    cursor: pointer;
    padding: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background 0.2s;
}

.close-btn:hover {
    background: rgba(255,255,255,0.1);
}

.modal-body {
    padding: 20px;
    overflow-y: auto;
}

.log-entry {
    padding: 12px;
    margin-bottom: 10px;
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    border-left: 4px solid #35654d;
}

.log-entry.gain {
    border-left-color: #51cf66;
    background: rgba(81, 207, 102, 0.1);
}

.log-entry.loss {
    border-left-color: #ff6b6b;
    background: rgba(255, 107, 107, 0.1);
}

.log-entry.pass {
    border-left-color: #ffd43b;
    background: rgba(255, 212, 59, 0.1);
}

.log-time {
    font-size: 0.8em;
    opacity: 0.6;
    margin-bottom: 4px;
}

.log-message {
    font-size: 0.95em;
}

@media (max-width: 600px) {
    h1 {
        font-size: 1.5em;
    }
    
    .game-info {
        grid-template-columns: 1fr;
    }
    
    th, td {
        padding: 10px;
        font-size: 0.9em;
    }
}
''';

  static const String appJs = '''
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Connetti al WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host + '/api/ws';
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('WebSocket connesso');
            reconnectAttempts = 0;
            updateStatus(true);
        };
        
        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'initial' || message.type === 'update') {
                updateGameState(message.data);
            }
        };
        
        ws.onerror = (error) => {
            console.error('Errore WebSocket:', error);
            updateStatus(false);
        };
        
        ws.onclose = () => {
            console.log('WebSocket disconnesso');
            updateStatus(false);
            
            // Riconnessione automatica
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                setTimeout(connectWebSocket, 2000 * reconnectAttempts);
            }
        };
    } catch (error) {
        console.error('Errore connessione WebSocket:', error);
        updateStatus(false);
    }
}

// Aggiorna stato connessione
function updateStatus(connected) {
    const statusEl = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    
    if (connected) {
        statusEl.classList.add('connected');
        statusText.textContent = 'Connesso';
    } else {
        statusEl.classList.remove('connected');
        statusText.textContent = 'Disconnesso';
    }
}

// Aggiorna lo stato del gioco
function updateGameState(data) {
    // Aggiorna piatto
    document.getElementById('pot').textContent = data.currentPot.toFixed(2) + '€';
    
    // Aggiorna fase
    document.getElementById('phase').textContent = data.currentPhase;
    
    // Aggiorna dealer
    document.getElementById('dealer').textContent = data.dealerName || '-';
    
    // Aggiorna tabella giocatori
    const tbody = document.getElementById('scoreBody');
    
    if (!data.players || data.players.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="no-data">Nessun giocatore al tavolo</td></tr>';
        return;
    }
    
    // Ordina per punteggio decrescente
    const sortedPlayers = [...data.players].sort((a, b) => b.score - a.score);
    
    tbody.innerHTML = sortedPlayers.map(player => {
        const isDealer = player.name === data.dealerName;
        const scoreClass = player.score > 0 ? 'positive' : (player.score < 0 ? 'negative' : '');
        const statusClass = player.score > 0 ? 'winning' : (player.score < 0 ? 'losing' : 'neutral');
        const statusText = player.score > 0 ? '🟢' : (player.score < 0 ? '🔴' : '⚪');
        
        return `
            <tr>
                <td>
                    <span class="player-name">${escapeHtml(player.name)}</span>
                    ${isDealer ? '<span class="dealer-badge">👑 DEALER</span>' : ''}
                </td>
                <td>
                    <span class="score ${scoreClass}">${player.score.toFixed(2)}€</span>
                </td>
                <td>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// Escape HTML per sicurezza
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Refresh manuale dati
async function refreshData() {
    try {
        const response = await fetch('/api/game-state');
        const data = await response.json();
        updateGameState(data);
    } catch (error) {
        console.error('Errore refresh:', error);
    }
}

// Mostra storico
async function showHistory() {
    const modal = document.getElementById('historyModal');
    const body = document.getElementById('historyBody');
    
    modal.classList.add('active');
    body.innerHTML = '<p class="no-data">Caricamento...</p>';
    
    try {
        const response = await fetch('/api/history');
        const data = await response.json();
        
        if (!data.logs || data.logs.length === 0) {
            body.innerHTML = '<p class="no-data">Nessuno storico disponibile</p>';
            return;
        }
        
        body.innerHTML = data.logs.map(log => {
            const date = new Date(log.timestamp);
            const timeStr = date.toLocaleTimeString('it-IT', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            return `
                <div class="log-entry ${log.type}">
                    <div class="log-time">${timeStr}</div>
                    <div class="log-message">${escapeHtml(log.message)}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Errore caricamento storico:', error);
        body.innerHTML = '<p class="no-data">Errore nel caricamento</p>';
    }
}

// Chiudi storico
function closeHistory() {
    document.getElementById('historyModal').classList.remove('active');
}

// Chiudi modale cliccando fuori
document.getElementById('historyModal').addEventListener('click', (e) => {
    if (e.target.id === 'historyModal') {
        closeHistory();
    }
});

// Inizializza al caricamento pagina
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    refreshData();
});
''';
}
