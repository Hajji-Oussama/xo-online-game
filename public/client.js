// ===============================================
// 🎮 XO Game Client - النسخة المبسطة والموثوقة
// ===============================================

class XOGameClient {
    constructor() {
        this.state = {
            player: null,
            room: null,
            lobbyPlayers: [],
            connectionStatus: 'disconnected'
        };

        this.initializeApp();
        this.setupEventHandlers();
        
        console.log('🎮 عميل XO - جاهز');
    }

    initializeApp() {
        this.cacheElements();
        this.initializeBoard();
        this.connectToServer();
    }

    cacheElements() {
        this.elements = {
            // الشاشات
            loadingScreen: document.getElementById('loading-screen'),
            mainContainer: document.querySelector('.container'),
            loginScreen: document.getElementById('login-screen'),
            lobbyScreen: document.getElementById('lobby-screen'),
            gameScreen: document.getElementById('game-screen'),

            // الدخول
            playerNameInput: document.getElementById('player-name-input'),
            joinButton: document.getElementById('join-button'),

            // الردهة
            myNameDisplay: document.getElementById('my-name-display'),
            lobbyList: document.getElementById('lobby-list'),
            playersCount: document.getElementById('players-count'),

            // اللعبة
            roomIdDisplay: document.getElementById('room-id-display'),
            playerXName: document.getElementById('player-x-name'),
            playerOName: document.getElementById('player-o-name'),
            statusMessage: document.getElementById('status-message'),
            boardElement: document.getElementById('game-board'),
            timerDisplay: document.getElementById('timer'),
            movesDisplay: document.getElementById('moves')
        };
    }

    connectToServer() {
        try {
            // الاتصال بالسيرفر
            this.socket = io({
                transports: ['websocket', 'polling'],
                timeout: 10000
            });

            this.setupSocketHandlers();
            
        } catch (error) {
            console.error('❌ فشل الاتصال:', error);
            this.showNotification('فشل الاتصال بالخادم', 'error');
            this.hideLoadingScreen();
        }
    }

    setupSocketHandlers() {
        // 🔗 أحداث الاتصال
        this.socket.on('connect', () => {
            console.log('✅ متصل بالخادم');
            this.updateConnectionStatus(true);
            this.hideLoadingScreen();
        });

        this.socket.on('disconnect', () => {
            console.log('🔌 انقطع الاتصال');
            this.updateConnectionStatus(false);
            this.showNotification('انقطع الاتصال بالخادم', 'error');
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ خطأ الاتصال:', error);
            this.updateConnectionStatus(false);
            this.hideLoadingScreen();
            this.showNotification('تعذر الاتصال بالخادم', 'error');
        });

        // 👤 أحداث اللاعب
        this.socket.on('lobbyJoined', (data) => this.handleLobbyJoined(data));
        this.socket.on('lobbyUpdated', (data) => this.handleLobbyUpdate(data));
        this.socket.on('inviteReceived', (data) => this.handleInviteReceived(data));

        // 🎮 أحداث اللعبة
        this.socket.on('gameStarted', (data) => this.handleGameStarted(data));
        this.socket.on('gameStateUpdated', (data) => this.handleGameStateUpdate(data));
        this.socket.on('opponentLeft', (data) => this.handleOpponentLeft(data));

        // ❌ أحداث الأخطاء
        this.socket.on('error', (data) => this.handleError(data));
    }

    setupEventHandlers() {
        // أحداث الدخول
        this.elements.joinButton.addEventListener('click', () => this.joinLobby());
        this.elements.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinLobby();
        });

        // أحداث التبويبات
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
    }

    initializeBoard() {
        if (!this.elements.boardElement) return;
        
        this.elements.boardElement.innerHTML = '';
        this.cells = [];

        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = i;
            cell.addEventListener('click', () => this.handleCellClick(i));
            this.elements.boardElement.appendChild(cell);
            this.cells.push(cell);
        }
    }

    // 🎯 الدوال الرئيسية
    joinLobby() {
        const playerName = this.elements.playerNameInput.value.trim();
        
        if (!this.validateName(playerName)) {
            this.showNotification('الرجاء إدخال اسم صحيح (2-20 حرفاً)', 'error');
            return;
        }

        this.socket.emit('joinLobby', { playerName });
    }

    handleLobbyJoined(data) {
        this.state.player = {
            name: data.playerName
        };

        this.elements.myNameDisplay.textContent = data.playerName;
        this.showScreen('lobby');
        this.showNotification(`مرحباً ${data.playerName}!`, 'success');
    }

    handleLobbyUpdate(data) {
        if (data.players) {
            this.state.lobbyPlayers = data.players;
            this.renderLobby();
        }
    }

    handleInviteReceived(data) {
        this.showNotification(`دعوة من ${data.inviterName}`, 'info');
        // يمكن إضافة نافذة قبول الدعوة لاحقاً
    }

    handleGameStarted(data) {
        this.state.room = data.room;
        this.state.mySymbol = data.mySymbol;
        
        this.showScreen('game');
        this.renderGameState();
        this.showNotification('بدأت اللعبة!', 'success');
    }

    handleGameStateUpdate(data) {
        if (this.state.room && data.state) {
            this.state.room.state = data.state;
            this.renderGameState();
        }
    }

    handleCellClick(index) {
        if (this.state.room && this.state.room.state && this.state.room.state.active) {
            this.socket.emit('makeMove', { 
                cellIndex: index,
                roomId: this.state.room.id
            });
        }
    }

    // 🎨 دوال العرض
    renderLobby() {
        const lobbyList = this.elements.lobbyList;
        if (!lobbyList) return;

        if (!this.state.lobbyPlayers || this.state.lobbyPlayers.length === 0) {
            lobbyList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👀</div>
                    <p>لا يوجد لاعبون آخرون متصلون</p>
                </div>
            `;
            return;
        }

        lobbyList.innerHTML = this.state.lobbyPlayers.map(player => `
            <div class="player-item">
                <div class="player-info">
                    <span class="player-name">${this.escapeHtml(player.name)}</span>
                    <span class="player-status ${player.status}">
                        ${this.getStatusText(player.status)}
                    </span>
                </div>
                <button class="btn btn-primary btn-small invite-btn" 
                        onclick="gameClient.sendInvite('${player.id}', '${player.name}')">
                    <span class="btn-icon">🎯</span>
                    دعوة
                </button>
            </div>
        `).join('');

        this.elements.playersCount.textContent = this.state.lobbyPlayers.length;
    }

    renderGameState() {
        if (!this.state.room) return;

        const { state, players } = this.state.room;
        
        // تحديث معلومات اللاعبين
        const playerX = players.find(p => p.symbol === 'X');
        const playerO = players.find(p => p.symbol === 'O');
        
        if (this.elements.playerXName) this.elements.playerXName.textContent = playerX?.name || '...';
        if (this.elements.playerOName) this.elements.playerOName.textContent = playerO?.name || '...';
        
        // تحديث رسالة الحالة
        if (this.elements.statusMessage) {
            this.elements.statusMessage.innerHTML = `
                <span class="message-icon">🎮</span>
                <span class="message-text">${state.message || ''}</span>
            `;
        }

        // تحديث اللوحة
        this.updateBoard(state);
    }

    updateBoard(state) {
        if (!state.board || !this.cells) return;
        
        state.board.forEach((symbol, index) => {
            const cell = this.cells[index];
            if (cell) {
                cell.textContent = symbol || '';
                cell.className = `cell ${symbol || ''}`;
            }
        });
    }

    // 🔧 أدوات مساعدة
    validateName(name) {
        return name && name.length >= 2 && name.length <= 20;
    }

    showScreen(screenName) {
        // إخفاء جميع الشاشات
        ['login', 'lobby', 'game'].forEach(screen => {
            const element = document.getElementById(`${screen}-screen`);
            if (element) element.classList.remove('active');
        });

        // إظهار الشاشة المطلوبة
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) targetScreen.classList.add('active');
    }

    hideLoadingScreen() {
        setTimeout(() => {
            if (this.elements.loadingScreen) {
                this.elements.loadingScreen.style.display = 'none';
            }
            if (this.elements.mainContainer) {
                this.elements.mainContainer.style.display = 'block';
            }
        }, 1000);
    }

    updateConnectionStatus(connected) {
        this.state.connectionStatus = connected ? 'connected' : 'disconnected';
    }

    showNotification(message, type = 'info') {
        console.log(`💬 ${type}: ${message}`);
        // يمكن إضافة إشعارات واجهة لاحقاً
    }

    switchTab(tabName) {
        // تحديث التبويبات
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // تحديث المحتويات
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }

    getStatusText(status) {
        const statusMap = {
            'available': '🟢 متاح',
            'in_game': '🔴 في لعبة'
        };
        return statusMap[status] || status;
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    sendInvite(targetId, targetName) {
        this.socket.emit('sendInvite', { targetId });
        this.showNotification(`تم إرسال دعوة إلى ${targetName}`, 'success');
    }

    handleOpponentLeft(data) {
        this.showNotification(data.message || 'غادر الخصم الغرفة', 'warning');
        this.showScreen('lobby');
    }

    handleError(data) {
        this.showNotification(data.message || 'حدث خطأ', 'error');
    }
}

// تشغيل التطبيق
document.addEventListener('DOMContentLoaded', () => {
    window.gameClient = new XOGameClient();
});