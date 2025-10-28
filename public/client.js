// ===============================================
// 🎮 XO Game Client - النسخة الكاملة والمحسنة
// ===============================================

class XOGameClient {
    constructor() {
        this.config = {
            RECONNECTION_ATTEMPTS: 5,
            RECONNECTION_DELAY: 2000,
            NOTIFICATION_TIMEOUT: 4000
        };

        this.state = {
            player: null,
            room: null,
            lobbyPlayers: [],
            pendingInvite: null,
            mySymbol: null,
            connectionStatus: 'disconnected',
            gameTimer: null,
            moves: 0
        };

        this.initializeApp();
        console.log('🎮 عميل XO - جاهز للتشغيل');
    }

    initializeApp() {
        this.cacheElements();
        this.initializeBoard();
        this.setupEventListeners();
        this.connectToServer();
        this.simulateLoading();
    }

    cacheElements() {
        this.elements = {
            // الشاشات
            loadingScreen: document.getElementById('loading-screen'),
            loginScreen: document.getElementById('login-screen'),
            lobbyScreen: document.getElementById('lobby-screen'),
            gameScreen: document.getElementById('game-screen'),

            // الدخول
            playerNameInput: document.getElementById('player-name'),
            joinButton: document.getElementById('join-btn'),

            // الردهة
            playerNameDisplay: document.getElementById('player-name-display'),
            playersList: document.getElementById('players-list'),
            lobbyPlayersCount: document.getElementById('lobby-players-count'),
            availablePlayers: document.getElementById('available-players'),
            totalGames: document.getElementById('total-games'),
            serverUptime: document.getElementById('server-uptime'),
            refreshButton: document.getElementById('refresh-btn'),
            quickMatchButton: document.getElementById('quick-match'),

            // اللعبة
            roomId: document.getElementById('room-id'),
            movesCount: document.getElementById('moves-count'),
            playerXName: document.getElementById('player-x-name'),
            playerOName: document.getElementById('player-o-name'),
            playerXStatus: document.getElementById('player-x-status'),
            playerOStatus: document.getElementById('player-o-status'),
            statusMessage: document.getElementById('status-message'),
            gameStatus: document.getElementById('game-status'),
            board: document.getElementById('board'),
            restartButton: document.getElementById('restart-game'),
            readyButton: document.getElementById('ready-btn'),
            leaveButton: document.getElementById('leave-game'),

            // النماذج
            inviteModal: document.getElementById('invite-modal'),
            inviterName: document.getElementById('inviter-name'),
            acceptInviteBtn: document.getElementById('accept-invite'),
            declineInviteBtn: document.getElementById('decline-invite'),
            modalClose: document.querySelector('.modal-close'),

            // الحالة
            connectionStatus: document.getElementById('connection-status'),
            onlineCount: document.getElementById('online-count'),
            activeRooms: document.getElementById('active-rooms'),

            // الإشعارات
            notifications: document.getElementById('notifications')
        };
    }

    simulateLoading() {
        let progress = 0;
        const progressBar = document.querySelector('.loading-progress');
        const steps = document.querySelectorAll('.loading-steps .step');
        
        const interval = setInterval(() => {
            progress += 2;
            if (progressBar) {
                progressBar.style.width = progress + '%';
            }
            
            if (progress >= 33 && progress < 66) {
                steps[0]?.classList.remove('active');
                steps[1]?.classList.add('active');
            } else if (progress >= 66) {
                steps[1]?.classList.remove('active');
                steps[2]?.classList.add('active');
            }
            
            if (progress >= 100) {
                clearInterval(interval);
                // الانتقال للشاشة التالية يعتمد على حالة الاتصال
            }
        }, 40);
    }

    connectToServer() {
        try {
            this.socket = io({
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnectionAttempts: this.config.RECONNECTION_ATTEMPTS,
                reconnectionDelay: this.config.RECONNECTION_DELAY
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
        this.socket.on('connect', () => this.handleConnect());
        this.socket.on('disconnect', (reason) => this.handleDisconnect(reason));
        this.socket.on('connect_error', (error) => this.handleConnectError(error));
        this.socket.on('reconnect_attempt', () => this.handleReconnectAttempt());

        // 👤 أحداث اللاعب
        this.socket.on('lobbyJoined', (data) => this.handleLobbyJoined(data));
        this.socket.on('lobbyUpdated', (data) => this.handleLobbyUpdate(data));
        this.socket.on('inviteReceived', (data) => this.handleInviteReceived(data));
        this.socket.on('inviteSent', (data) => this.handleInviteSent(data));
        this.socket.on('inviteDeclined', (data) => this.handleInviteDeclined(data));

        // 🎮 أحداث اللعبة
        this.socket.on('gameStarted', (data) => this.handleGameStarted(data));
        this.socket.on('gameStateUpdated', (data) => this.handleGameStateUpdate(data));
        this.socket.on('gameCompleted', (data) => this.handleGameCompleted(data));
        this.socket.on('gameRestarted', (data) => this.handleGameRestarted(data));
        this.socket.on('opponentLeft', (data) => this.handleOpponentLeft(data));

        // ❌ أحداث الأخطاء
        this.socket.on('error', (data) => this.handleError(data));
    }

    setupEventListeners() {
        // أحداث الدخول
        this.elements.joinButton.addEventListener('click', () => this.joinLobby());
        this.elements.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinLobby();
        });

        // أحداث الردهة
        this.elements.refreshButton.addEventListener('click', () => this.refreshLobby());
        this.elements.quickMatchButton.addEventListener('click', () => this.findQuickMatch());

        // أحداث اللعبة
        this.elements.restartButton.addEventListener('click', () => this.requestRestart());
        this.elements.readyButton.addEventListener('click', () => this.markReady());
        this.elements.leaveButton.addEventListener('click', () => this.leaveRoom());

        // أحداث النماذج
        this.elements.acceptInviteBtn.addEventListener('click', () => this.acceptInvite());
        this.elements.declineInviteBtn.addEventListener('click', () => this.declineInvite());
        this.elements.modalClose.addEventListener('click', () => this.hideInviteModal());

        // إغلاق النموذج بالنقر خارج المحتوى
        this.elements.inviteModal.addEventListener('click', (e) => {
            if (e.target === this.elements.inviteModal) {
                this.hideInviteModal();
            }
        });

        // منع إغلاق النموذج بالنقر داخل المحتوى
        this.elements.inviteModal.querySelector('.modal-content').addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    initializeBoard() {
        if (!this.elements.board) return;
        
        this.elements.board.innerHTML = '';
        this.cells = [];

        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = i;
            cell.addEventListener('click', () => this.handleCellClick(i));
            this.elements.board.appendChild(cell);
            this.cells.push(cell);
        }
    }

    // 🎯 معالجات الأحداث
    handleConnect() {
        console.log('✅ متصل بالخادم بنجاح');
        this.updateConnectionStatus(true);
        this.showNotification('تم الاتصال بالخادم بنجاح', 'success');
        this.hideLoadingScreen();
        this.showScreen('login');
    }

    handleDisconnect(reason) {
        console.log('🔌 انقطع الاتصال:', reason);
        this.updateConnectionStatus(false);
        this.showNotification('انقطع الاتصال بالخادم', 'error');
    }

    handleConnectError(error) {
        console.error('❌ خطأ في الاتصال:', error);
        this.updateConnectionStatus(false);
        this.hideLoadingScreen();
        this.showScreen('login');
        this.showNotification('تعذر الاتصال بالخادم', 'error');
    }

    handleReconnectAttempt() {
        console.log('🔄 جاري إعادة الاتصال...');
        this.showNotification('جاري إعادة الاتصال...', 'warning');
    }

    // 👤 معالجات اللاعبين
    joinLobby() {
        const playerName = this.elements.playerNameInput.value.trim();
        
        if (!this.validateName(playerName)) {
            this.showNotification('الرجاء إدخال اسم صحيح (2-15 حرفاً)', 'error');
            return;
        }

        this.socket.emit('joinLobby', { playerName });
    }

    handleLobbyJoined(data) {
        this.state.player = {
            name: data.playerName,
            id: this.socket.id
        };

        this.elements.playerNameDisplay.textContent = data.playerName;
        this.updateServerStats(data.serverStats);
        this.showScreen('lobby');
        this.showNotification(`مرحباً ${data.playerName}!`, 'success');
    }

    handleLobbyUpdate(data) {
        if (data.players) {
            this.state.lobbyPlayers = data.players;
            this.renderLobby();
        }
        
        if (data.serverStats) {
            this.updateServerStats(data.serverStats);
        }
    }

    handleInviteReceived(data) {
        this.state.pendingInvite = data;
        this.showInviteModal(data.inviterName);
        this.playSound('notification');
    }

    handleInviteSent(data) {
        this.showNotification(data.message || 'تم إرسال الدعوة بنجاح', 'success');
    }

    handleInviteDeclined(data) {
        this.showNotification(`رفض ${data.targetName} دعوتك`, 'warning');
    }

    // 🎮 معالجات اللعبة
    handleGameStarted(data) {
        this.state.room = data.room;
        this.state.mySymbol = data.mySymbol;
        this.state.moves = 0;
        
        this.updateGameInfo();
        this.showScreen('game');
        this.startGameTimer();
        this.showNotification('بدأت اللعبة! حظاً موفقاً', 'success');
        this.playSound('notification');
    }

    handleGameStateUpdate(data) {
        if (this.state.room && data.state) {
            this.state.room.state = data.state;
            this.state.moves = data.moves || 0;
            this.updateGameState();
        }
    }

    handleGameCompleted(data) {
        this.updateGameState();
        
        if (data.winner === this.state.mySymbol) {
            this.showNotification('🎉 فزت في اللعبة!', 'success');
            this.playSound('win');
        } else if (data.winner === 'draw') {
            this.showNotification('🤝 تعادل!', 'info');
        } else {
            this.showNotification('💔 خسرت هذه الجولة', 'warning');
        }

        this.elements.restartButton.disabled = false;
        this.elements.readyButton.classList.remove('hidden');
    }

    handleGameRestarted(data) {
        this.state.room.state = data.state;
        this.state.moves = 0;
        this.updateGameState();
        this.startGameTimer();
        this.showNotification('بدأت جولة جديدة!', 'info');
    }

    handleOpponentLeft(data) {
        this.showNotification(data.message, 'warning');
        this.showScreen('lobby');
        this.resetGameState();
    }

    handleError(data) {
        this.showNotification(data.message || 'حدث خطأ غير متوقع', 'error');
    }

    // 🎯 تفاعلات اللعبة
    handleCellClick(index) {
        if (!this.canMakeMove()) {
            this.showNotification('لا يمكنك الحركة الآن', 'warning');
            return;
        }

        this.socket.emit('makeMove', { 
            cellIndex: index,
            roomId: this.state.room.id,
            timestamp: Date.now()
        });
        
        this.playSound('click');
    }

    requestRestart() {
        this.socket.emit('requestRestart');
        this.showNotification('تم طلب إعادة اللعبة...', 'info');
    }

    markReady() {
        this.socket.emit('playerReady');
        this.elements.readyButton.classList.add('hidden');
        this.showNotification('أنت جاهز للجولة التالية', 'success');
    }

    leaveRoom() {
        if (confirm('هل تريد مغادرة الغرفة؟')) {
            this.socket.emit('leaveRoom');
            this.showScreen('lobby');
            this.resetGameState();
            this.showNotification('تم مغادرة الغرفة', 'info');
        }
    }

    sendInvite(targetId, targetName) {
        this.socket.emit('sendInvite', { targetId });
        this.showNotification(`تم إرسال دعوة إلى ${targetName}`, 'success');
    }

    acceptInvite() {
        if (this.state.pendingInvite) {
            this.socket.emit('acceptInvite', { 
                inviteId: this.state.pendingInvite.inviteId 
            });
            this.hideInviteModal();
        }
    }

    declineInvite() {
        if (this.state.pendingInvite) {
            this.socket.emit('declineInvite', { 
                inviteId: this.state.pendingInvite.inviteId 
            });
            this.hideInviteModal();
            this.showNotification('تم رفض الدعوة', 'info');
        }
    }

    findQuickMatch() {
        if (this.state.lobbyPlayers.length > 1) {
            // إرسال دعوة لأول لاعب متاح
            const availablePlayer = this.state.lobbyPlayers.find(p => p.id !== this.socket.id);
            if (availablePlayer) {
                this.sendInvite(availablePlayer.id, availablePlayer.name);
            } else {
                this.showNotification('لا يوجد لاعبون متاحون حالياً', 'warning');
            }
        } else {
            this.showNotification('انتظر حتى ينضم لاعب آخر', 'info');
        }
    }

    refreshLobby() {
        this.socket.emit('getLobbyUpdate');
        this.showNotification('تم تحديث قائمة اللاعبين', 'success');
    }

    // 🎨 دوال العرض
    renderLobby() {
        const playersList = this.elements.playersList;
        if (!playersList) return;

        const availablePlayers = this.state.lobbyPlayers.filter(p => p.status === 'available' && p.id !== this.socket.id);

        if (availablePlayers.length === 0) {
            playersList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👀</div>
                    <p>لا يوجد لاعبون آخرون متصلون</p>
                    <small>انتظر حتى ينضم لاعب آخر أو ادعُ صديقاً</small>
                </div>
            `;
        } else {
            playersList.innerHTML = availablePlayers.map(player => `
                <div class="player-item">
                    <div class="player-info">
                        <div class="player-name">${this.escapeHtml(player.name)}</div>
                        <div class="player-status">🟢 متاح للعب</div>
                    </div>
                    <button class="btn primary small" 
                            onclick="gameClient.sendInvite('${player.id}', '${player.name}')">
                        <span class="btn-icon">🎯</span>
                        دعوة
                    </button>
                </div>
            `).join('');
        }

        // تحديث الإحصائيات
        this.elements.lobbyPlayersCount.textContent = this.state.lobbyPlayers.length;
        this.elements.availablePlayers.textContent = availablePlayers.length;
        this.elements.onlineCount.textContent = this.state.lobbyPlayers.length;
    }

    updateGameInfo() {
        if (!this.state.room) return;

        this.elements.roomId.textContent = this.state.room.id;
        this.elements.movesCount.textContent = this.state.moves;

        const playerX = this.state.room.players.find(p => p.symbol === 'X');
        const playerO = this.state.room.players.find(p => p.symbol === 'O');

        this.elements.playerXName.textContent = playerX?.name || '...';
        this.elements.playerOName.textContent = playerO?.name || '...';

        // تحديث حالة اللاعبين
        this.updatePlayersStatus();
    }

    updateGameState() {
        if (!this.state.room?.state) return;

        const state = this.state.room.state;
        
        // تحديث رسالة الحالة
        this.elements.statusMessage.textContent = state.message;
        
        // تحديث حالة اللاعبين
        this.updatePlayersStatus();

        // تحديث عدد الحركات
        this.elements.movesCount.textContent = this.state.moves;

        // تحديث اللوحة
        this.updateBoard(state);

        // تحديث أزرار التحكم
        this.updateGameControls(state);
    }

    updateBoard(state) {
        if (!state.board || !this.cells) return;
        
        state.board.forEach((symbol, index) => {
            const cell = this.cells[index];
            if (cell) {
                cell.textContent = symbol || '';
                cell.className = `cell ${symbol || ''}`;
                
                if (symbol) {
                    cell.classList.add('taken');
                } else {
                    cell.classList.remove('taken');
                }

                // تعطيل الخلايا عندما لا يكون دور اللاعب
                const isMyTurn = state.active && this.state.mySymbol === state.currentPlayer;
                cell.classList.toggle('disabled', !isMyTurn || symbol !== null || !state.active);
            }
        });
    }

    updatePlayersStatus() {
        if (!this.state.room?.state) return;

        const state = this.state.room.state;
        const isMyTurn = state.active && this.state.mySymbol === state.currentPlayer;

        // تحديث حالة اللاعب X
        if (this.state.mySymbol === 'X') {
            this.elements.playerXStatus.textContent = isMyTurn ? '🎯 دورك' : '⏳ في انتظار الخصم';
            this.elements.playerOStatus.textContent = isMyTurn ? '⏳ في انتظارك' : '🎯 دور الخصم';
        } else {
            this.elements.playerXStatus.textContent = isMyTurn ? '⏳ في انتظارك' : '🎯 دور الخصم';
            this.elements.playerOStatus.textContent = isMyTurn ? '🎯 دورك' : '⏳ في انتظار الخصم';
        }

        // تمييز اللاعب النشط
        this.elements.playerXName.parentElement.parentElement.classList.toggle('active', state.currentPlayer === 'X');
        this.elements.playerOName.parentElement.parentElement.classList.toggle('active', state.currentPlayer === 'O');
    }

    updateGameControls(state) {
        this.elements.restartButton.disabled = state.active;
        this.elements.readyButton.classList.toggle('hidden', state.active || !state.winner);
    }

    updateServerStats(stats) {
        if (stats) {
            this.elements.totalGames.textContent = stats.totalGames || 0;
            this.elements.serverUptime.textContent = stats.uptime || '00:00';
            this.elements.activeRooms.textContent = stats.activeRooms || 0;
        }
    }

    // 🔧 أدوات مساعدة
    validateName(name) {
        return name && name.length >= 2 && name.length <= 15;
    }

    canMakeMove() {
        return this.state.room && 
               this.state.room.state && 
               this.state.room.state.active && 
               !this.state.room.state.winner &&
               this.state.mySymbol === this.state.room.state.currentPlayer;
    }

    showScreen(screenName) {
        // إخفاء جميع الشاشات
        ['login', 'lobby', 'game'].forEach(screen => {
            const element = document.getElementById(`${screen}-screen`);
            if (element) element.classList.add('hidden');
        });

        // إظهار الشاشة المطلوبة
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.remove('hidden');
            targetScreen.style.display = 'flex';
        }
    }

    hideLoadingScreen() {
        setTimeout(() => {
            if (this.elements.loadingScreen) {
                this.elements.loadingScreen.classList.add('hidden');
            }
        }, 500);
    }

    updateConnectionStatus(connected) {
        const statusElement = this.elements.connectionStatus;
        if (statusElement) {
            if (connected) {
                statusElement.innerHTML = '<div class="status-dot"></div><span>متصل</span>';
                statusElement.classList.add('connected');
            } else {
                statusElement.innerHTML = '<div class="status-dot"></div><span>غير متصل</span>';
                statusElement.classList.remove('connected');
            }
        }
    }

    showNotification(message, type = 'info') {
        const notifications = this.elements.notifications;
        if (!notifications) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        let icon = '💡';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '❌';
        if (type === 'warning') icon = '⚠️';

        notification.innerHTML = `
            <span class="notification-icon">${icon}</span>
            <div class="notification-content">
                <div class="notification-message">${message}</div>
            </div>
        `;

        notifications.appendChild(notification);

        // إزالة الإشعار تلقائياً
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideInLeft 0.3s ease-in-out reverse';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, this.config.NOTIFICATION_TIMEOUT);
    }

    showInviteModal(inviterName) {
        this.elements.inviterName.textContent = inviterName;
        this.elements.inviteModal.classList.remove('hidden');
    }

    hideInviteModal() {
        this.elements.inviteModal.classList.add('hidden');
        this.state.pendingInvite = null;
    }

    startGameTimer() {
        this.stopGameTimer();
        let seconds = 0;
        
        this.state.gameTimer = setInterval(() => {
            seconds++;
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            // يمكن إضافة عرض المؤقت إذا كان مطلوباً
        }, 1000);
    }

    stopGameTimer() {
        if (this.state.gameTimer) {
            clearInterval(this.state.gameTimer);
            this.state.gameTimer = null;
        }
    }

    resetGameState() {
        this.state.room = null;
        this.state.mySymbol = null;
        this.state.moves = 0;
        this.stopGameTimer();
        this.initializeBoard();
    }

    playSound(soundName) {
        // يمكن إضافة أصوات حقيقية لاحقاً
        console.log(`🔊 تشغيل صوت: ${soundName}`);
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// تشغيل التطبيق
document.addEventListener('DOMContentLoaded', () => {
    window.gameClient = new XOGameClient();
    
    // إضافة بعض التحسينات الإضافية
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && window.gameClient) {
            window.gameClient.refreshLobby();
        }
    });
    
    console.log('🎉 تطبيق XO محمل بنجاح!');
});