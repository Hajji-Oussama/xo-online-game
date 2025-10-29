// ===============================================
// ** XO Game Client - النسخة المحسنة **
// ===============================================

class XOGameClient {
    constructor() {
        this.socket = io({
            transports: ['websocket', 'polling'],
            timeout: 10000,
            reconnectionAttempts: 5
        });
        
        this.state = {
            player: null,
            room: null,
            lobbyPlayers: [],
            pendingInvite: null,
            mySymbol: null,
            opponent: null,
            leaderboard: [],
            serverStats: {
                onlinePlayers: 0,
                activeRooms: 0,
                totalGames: 0
            },
            gameTimer: {
                startTime: null,
                interval: null,
                display: '00:00'
            }
        };
        
        this.sounds = {
            move: document.getElementById('move-sound'),
            win: document.getElementById('win-sound'),
            draw: document.getElementById('draw-sound'),
            notification: document.getElementById('notification-sound')
        };
        
        this.elements = this.initializeElements();
        this.initializeApp();
        this.setupSocketHandlers();
        this.initializeEventListeners();
        
        console.log('🎮 عميل XO المحسن جاهز للتشغيل');
    }
    
    initializeElements() {
        return {
            // الشاشات الرئيسية
            loadingScreen: document.getElementById('loading-screen'),
            mainContainer: document.querySelector('.container'),
            
            // عناصر التبويب
            navTabs: document.querySelectorAll('.nav-tab'),
            tabContents: document.querySelectorAll('.tab-content'),
            
            // شاشة الدخول
            loginScreen: document.getElementById('login-screen'),
            playerNameInput: document.getElementById('player-name-input'),
            joinButton: document.getElementById('join-button'),
            quickOnline: document.getElementById('quick-online'),
            quickGames: document.getElementById('quick-games'),
            
            // شاشة الردهة
            lobbyScreen: document.getElementById('lobby-screen'),
            myNameDisplay: document.getElementById('my-name-display'),
            lobbyList: document.getElementById('lobby-list'),
            playersCount: document.getElementById('players-count'),
            refreshLobby: document.getElementById('refresh-lobby'),
            howToPlayBtn: document.getElementById('how-to-play-btn'),
            
            // شاشة اللعبة
            gameScreen: document.getElementById('game-screen'),
            roomIdDisplay: document.getElementById('room-id-display'),
            movesCount: document.getElementById('moves-count'),
            playerXDisplay: document.getElementById('player-x-display'),
            playerODisplay: document.getElementById('player-o-display'),
            playerXName: document.getElementById('player-x-name'),
            playerOName: document.getElementById('player-o-name'),
            statusMessage: document.getElementById('status-message'),
            boardElement: document.getElementById('game-board'),
            restartButton: document.getElementById('restart-button'),
            readyButton: document.getElementById('ready-button'),
            leaveRoomButton: document.getElementById('leave-room-button'),
            timerDisplay: document.getElementById('timer'),
            movesDisplay: document.getElementById('moves'),
            
            // لوحة المتصدرين
            leaderboardTab: document.getElementById('leaderboard-tab'),
            leaderboardList: document.getElementById('leaderboard-list'),
            refreshLeaderboard: document.getElementById('refresh-leaderboard'),
            
            // كيفية اللعب
            howToPlayTab: document.getElementById('how-to-play-tab'),
            
            // العناصر العامة
            onlineCount: document.getElementById('online-count'),
            roomsCount: document.getElementById('rooms-count'),
            gamesCount: document.getElementById('games-count'),
            connectionStatus: document.getElementById('connection-status'),
            
            // النماذج والإشعارات
            inviteModal: document.getElementById('invite-modal'),
            inviteMessage: document.getElementById('invite-message'),
            inviterName: document.getElementById('inviter-name'),
            acceptInviteBtn: document.getElementById('accept-invite'),
            declineInviteBtn: document.getElementById('decline-invite'),
            modalClose: document.querySelector('.modal-close'),
            notificationContainer: document.getElementById('notification-container')
        };
    }
    
    initializeApp() {
        this.hideLoadingScreen();
        this.initializeBoard();
        this.setupTabNavigation();
        this.updateServerStats();
        this.startConnectionMonitoring();
        
        // تحميل لوحة المتصدرين تلقائياً
        this.loadLeaderboard();
        
        console.log('✅ التطبيق مهيأ وجاهز للاستخدام');
    }
    
    setupSocketHandlers() {
        // أحداث الاتصال
        this.socket.on('connect', () => this.handleConnect());
        this.socket.on('disconnect', (reason) => this.handleDisconnect(reason));
        this.socket.on('connect_error', (error) => this.handleConnectError(error));
        
        // أحداث الردهة واللاعبين
        this.socket.on('lobbyJoined', (data) => this.handleLobbyJoined(data));
        this.socket.on('lobbyUpdated', (data) => this.handleLobbyUpdate(data));
        this.socket.on('lobbyUpdate', (data) => this.handleLobbyUpdate(data)); // للتوافقية
        
        // أحداث الدعوات
        this.socket.on('inviteReceived', (data) => this.handleInviteReceived(data));
        this.socket.on('inviteDeclined', (data) => this.handleInviteDeclined(data));
        
        // أحداث اللعبة
        this.socket.on('gameStarted', (data) => this.handleGameStarted(data));
        this.socket.on('gameStart', (data) => this.handleGameStarted(data)); // للتوافقية
        this.socket.on('gameStateUpdated', (data) => this.handleGameStateUpdate(data));
        this.socket.on('roomUpdate', (data) => this.handleRoomUpdate(data));
        this.socket.on('gameRestarted', (data) => this.handleGameRestarted(data));
        
        // أحداث خاصة
        this.socket.on('playerRequestedRestart', (data) => this.handlePlayerRequestedRestart(data));
        this.socket.on('opponentLeft', (data) => this.handleOpponentLeft(data));
        this.socket.on('serverStats', (data) => this.handleServerStats(data));
        this.socket.on('leaderboardData', (data) => this.handleLeaderboardData(data));
        this.socket.on('serverShutdown', (data) => this.handleServerShutdown(data));
        
        // أحداث الأخطاء
        this.socket.on('error', (data) => this.handleError(data));
    }
    
    initializeEventListeners() {
        // أحداث التبويب
        this.elements.navTabs.forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        // أحداث الدخول
        this.elements.joinButton.addEventListener('click', () => this.joinLobby());
        this.elements.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinLobby();
        });
        
        // أحداث الردهة
        this.elements.refreshLobby.addEventListener('click', () => this.refreshLobby());
        this.elements.howToPlayBtn.addEventListener('click', () => this.switchTab('how-to-play'));
        
        // أحداث اللعبة
        this.elements.restartButton.addEventListener('click', () => this.requestRestart());
        this.elements.readyButton.addEventListener('click', () => this.markReady());
        this.elements.leaveRoomButton.addEventListener('click', () => this.leaveRoom());
        
        // أحداث المتصدرين
        this.elements.refreshLeaderboard.addEventListener('click', () => this.loadLeaderboard());
        
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
    
    // ========== إدارة الاتصال ==========
    
    handleConnect() {
        console.log('✅ متصل بالخادم بنجاح');
        this.updateConnectionStatus(true);
        this.showNotification('تم الاتصال بالخادم', 'success');
    }
    
    handleDisconnect(reason) {
        console.log('🔌 انقطع الاتصال:', reason);
        this.updateConnectionStatus(false);
        this.showNotification('انقطع الاتصال بالخادم', 'error');
        
        if (reason === 'io server disconnect') {
            this.showNotification('تم فصل الاتصال من قبل الخادم', 'warning');
        }
    }
    
    handleConnectError(error) {
        console.error('❌ خطأ في الاتصال:', error);
        this.updateConnectionStatus(false);
        this.showNotification('تعذر الاتصال بالخادم', 'error');
    }
    
    updateConnectionStatus(connected) {
        const statusElement = this.elements.connectionStatus;
        if (connected) {
            statusElement.className = 'status-connected';
            statusElement.innerHTML = '<span class="status-dot"></span>متصل';
        } else {
            statusElement.className = 'status-disconnected';
            statusElement.innerHTML = '<span class="status-dot"></span>غير متصل';
        }
    }
    
    startConnectionMonitoring() {
        // إرسال ping كل 30 ثانية للحفاظ على الاتصال نشطاً
        setInterval(() => {
            if (this.socket.connected) {
                this.socket.emit('ping', (response) => {
                    if (response !== 'pong') {
                        console.warn('⚠️ استجابة ping غير متوقعة');
                    }
                });
            }
        }, 30000);
    }
    
    // ========== إدارة التبويب ==========
    
    setupTabNavigation() {
        // إخفاء جميع المحتويات وإظهار المحتوى النشط فقط
        this.elements.tabContents.forEach(content => content.classList.remove('active'));
        this.elements.navTabs.forEach(tab => tab.classList.remove('active'));
    }
    
    switchTab(tabName) {
        // تحديث التبويبات
        this.elements.navTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // تحديث المحتويات
        this.elements.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
        
        // تحميل البيانات إذا لزم الأمر
        if (tabName === 'leaderboard') {
            this.loadLeaderboard();
        }
    }
    
    // ========== إدارة الشاشات ==========
    
    hideLoadingScreen() {
        setTimeout(() => {
            this.elements.loadingScreen.style.display = 'none';
            this.elements.mainContainer.style.display = 'block';
        }, 1000);
    }
    
    showScreen(screenName) {
        // إخفاء جميع الشاشات
        const screens = ['login', 'lobby', 'game'];
        screens.forEach(screen => {
            const element = document.getElementById(`${screen}-screen`);
            if (element) {
                element.classList.remove('active');
            }
        });
        
        // إظهار الشاشة المطلوبة
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }
        
        // تحديث التبويب النشط
        if (screenName === 'lobby' || screenName === 'game') {
            this.switchTab('play');
        }
    }
    
    // ========== إدارة اللاعب والردهة ==========
    
    joinLobby() {
        const playerName = this.elements.playerNameInput.value.trim();
        
        if (!this.validateName(playerName)) {
            this.showNotification('الرجاء إدخال اسم صحيح (2-20 حرفاً)', 'error');
            return;
        }
        
        this.setLoadingState(true);
        this.socket.emit('joinLobby', { playerName });
    }
    
    validateName(name) {
        return name && name.length >= 2 && name.length <= 20;
    }
    
    setLoadingState(loading) {
        this.elements.joinButton.disabled = loading;
        this.elements.joinButton.innerHTML = loading 
            ? '<span class="btn-icon">⏳</span>جاري الاتصال...'
            : '<span class="btn-icon">🚀</span>الدخول إلى الردهة';
    }
    
    refreshLobby() {
        this.socket.emit('getLobbyUpdate');
        this.showNotification('تم تحديث قائمة اللاعبين', 'success');
    }
    
    sendInvite(targetId, targetName) {
        this.socket.emit('sendInvite', { targetId });
        this.showNotification(`تم إرسال دعوة إلى ${targetName}`, 'success');
    }
    
    // ========== إدارة الدعوات ==========
    
    showInviteModal() {
        this.elements.inviteModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    hideInviteModal() {
        this.elements.inviteModal.classList.remove('active');
        document.body.style.overflow = '';
        this.state.pendingInvite = null;
    }
    
    acceptInvite() {
        if (this.state.pendingInvite) {
            this.socket.emit('acceptInvite', { inviterId: this.state.pendingInvite.inviterId });
            this.hideInviteModal();
            this.showNotification('تم قبول الدعوة', 'success');
        }
    }
    
    declineInvite() {
        if (this.state.pendingInvite) {
            this.socket.emit('declineInvite', { inviterId: this.state.pendingInvite.inviterId });
            this.hideInviteModal();
            this.showNotification('تم رفض الدعوة', 'info');
        }
    }
    
    // ========== إدارة اللعبة ==========
    
    handleCellClick(index) {
        if (this.canMakeMove()) {
            this.socket.emit('makeMove', { cellIndex: index });
            this.playSound('move');
        } else {
            this.showNotification('لا يمكنك الحركة الآن', 'warning');
        }
    }
    
    canMakeMove() {
        return this.state.room && 
               this.state.room.state && 
               this.state.room.state.active && 
               !this.state.room.state.winner &&
               this.state.mySymbol === this.state.room.state.currentPlayer;
    }
    
    requestRestart() {
        this.socket.emit('requestRestart');
        this.showNotification('تم طلب إعادة التشغيل... في انتظار الخصم', 'info');
    }
    
    markReady() {
        this.socket.emit('playerReady');
        this.showNotification('أنت جاهز لإعادة اللعب', 'success');
    }
    
    leaveRoom() {
        if (confirm('هل تريد مغادرة الغرفة؟ سيتم إنهاء اللعبة الحالية.')) {
            this.socket.emit('leaveRoom');
            this.showScreen('lobby');
            this.resetGameState();
            this.showNotification('تم مغادرة الغرفة', 'info');
        }
    }
    
    startGameTimer() {
        this.stopGameTimer();
        this.state.gameTimer.startTime = Date.now();
        
        this.state.gameTimer.interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.state.gameTimer.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            this.state.gameTimer.display = `${minutes}:${seconds}`;
            this.elements.timerDisplay.textContent = this.state.gameTimer.display;
        }, 1000);
    }
    
    stopGameTimer() {
        if (this.state.gameTimer.interval) {
            clearInterval(this.state.gameTimer.interval);
            this.state.gameTimer.interval = null;
        }
    }
    
    resetGameState() {
        this.state.room = null;
        this.state.mySymbol = null;
        this.state.opponent = null;
        this.stopGameTimer();
        this.initializeBoard();
    }
    
    // ========== معالجة الأحداث الواردة ==========
    
    handleLobbyJoined(data) {
        console.log('✅ انضممت للردهة:', data);
        
        this.state.player = {
            id: this.socket.id,
            name: data.playerName
        };
        
        this.elements.myNameDisplay.textContent = data.playerName;
        this.showScreen('lobby');
        this.setLoadingState(false);
        
        if (data.leaderboard) {
            this.state.leaderboard = data.leaderboard;
        }
        
        this.showNotification(`مرحباً ${data.playerName}! يمكنك الآن إرسال دعوات للاعبين الآخرين.`, 'success');
    }
    
    handleLobbyUpdate(data) {
        console.log('📊 تحديث الردهة:', data);
        
        if (data && data.players) {
            this.state.lobbyPlayers = data.players;
            this.renderLobby();
        }
    }
    
    handleInviteReceived(data) {
        console.log('📩 استلام دعوة:', data);
        
        if (data && data.inviterId && data.inviterName) {
            this.state.pendingInvite = data;
            this.elements.inviteMessage.textContent = `لديك دعوة للعب من`;
            this.elements.inviterName.textContent = data.inviterName;
            this.showInviteModal();
            this.playSound('notification');
        }
    }
    
    handleGameStarted(data) {
        console.log('🎮 بدأت اللعبة:', data);
        
        if (data && data.mySymbol && data.room) {
            this.state.mySymbol = data.mySymbol;
            this.state.room = data.room;
            this.state.opponent = data.opponent;
            
            this.showScreen('game');
            this.renderGameState();
            this.startGameTimer();
            
            this.showNotification(`بدأت اللعبة مع ${data.opponent.name}! أنت ${data.mySymbol}`, 'success');
            this.playSound('notification');
        }
    }
    
    handleGameStateUpdate(data) {
        console.log('🔄 تحديث حالة اللعبة:', data);
        
        if (data && data.state && this.state.room) {
            this.state.room.state = data.state;
            this.renderGameState();
            
            // تشغيل الأصوات عند انتهاء اللعبة
            if (data.state.winner) {
                if (data.state.winner === 'draw') {
                    this.playSound('draw');
                } else if (data.state.winner === this.state.mySymbol) {
                    this.playSound('win');
                }
            }
        }
    }
    
    handleRoomUpdate(data) {
        console.log('🔄 تحديث الغرفة:', data);
        
        if (data && data.state) {
            this.state.room = data;
            this.renderGameState();
        }
    }
    
    handleGameRestarted(data) {
        console.log('🔄 إعادة تشغيل اللعبة:', data);
        
        if (data && data.state && this.state.room) {
            this.state.room.state = data.state;
            this.renderGameState();
            this.startGameTimer();
            
            this.showNotification('تم إعادة تشغيل اللعبة!', 'success');
            this.playSound('notification');
        }
    }
    
    handlePlayerRequestedRestart(data) {
        console.log('🔄 طلب إعادة تشغيل:', data);
        
        if (data && data.playerName) {
            this.showNotification(`${data.playerName} يريد إعادة اللعب. اضغط على زر "جاهز" للموافقة.`, 'info');
        }
    }
    
    handleOpponentLeft(data) {
        console.log('🚪 الخصم غادر:', data);
        
        if (data && data.message) {
            this.showNotification(data.message, 'warning');
            this.showScreen('lobby');
            this.resetGameState();
        }
    }
    
    handleServerStats(data) {
        console.log('📈 إحصائيات الخادم:', data);
        
        if (data) {
            this.state.serverStats = { ...this.state.serverStats, ...data };
            this.updateServerStats();
        }
    }
    
    handleLeaderboardData(data) {
        console.log('🏆 بيانات المتصدرين:', data);
        
        if (data && data.leaderboard) {
            this.state.leaderboard = data.leaderboard;
            this.renderLeaderboard();
        }
    }
    
    handleServerShutdown(data) {
        console.log('🛑 إغلاق الخادم:', data);
        
        this.showNotification('يتم إغلاق الخادم للصيانة. الرجاء المحاولة لاحقاً.', 'warning');
        this.showScreen('login');
        this.resetGameState();
    }
    
    handleError(errorData) {
        console.error('❌ خطأ من الخادم:', errorData);
        
        let errorMessage = 'حدث خطأ غير معروف';
        
        if (typeof errorData === 'string') {
            errorMessage = errorData;
        } else if (errorData && errorData.message) {
            errorMessage = errorData.message;
        } else if (errorData && typeof errorData === 'object') {
            errorMessage = JSON.stringify(errorData);
        }
        
        this.showNotification(errorMessage, 'error');
        this.setLoadingState(false);
    }
    
    handleInviteDeclined(data) {
        console.log('❌ دعوة مرفوضة:', data);
        
        if (data && data.targetName) {
            this.showNotification(`رفض ${data.targetName} دعوتك.`, 'warning');
        }
    }
    
    // ========== عرض الواجهة ==========
    
    renderLobby() {
        const lobbyList = this.elements.lobbyList;
        
        if (!this.state.lobbyPlayers || this.state.lobbyPlayers.length === 0) {
            lobbyList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👀</div>
                    <p>لا يوجد لاعبون آخرون متصلون</p>
                    <small>افتح نافذة أخرى أو دع صديقاً للانضمام!</small>
                </div>
            `;
            this.elements.playersCount.textContent = '0';
            return;
        }
        
        // فلترة اللاعبين الذين ليسوا أنت
        const otherPlayers = this.state.lobbyPlayers.filter(p => p.id !== this.socket.id);
        this.elements.playersCount.textContent = otherPlayers.length.toString();
        
        if (otherPlayers.length === 0) {
            lobbyList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👀</div>
                    <p>لا يوجد لاعبون آخرون متصلون</p>
                    <small>افتح نافذة أخرى أو دع صديقاً للانضمام!</small>
                </div>
            `;
            return;
        }
        
        lobbyList.innerHTML = '';
        
        otherPlayers.forEach(player => {
            const li = document.createElement('div');
            li.className = 'player-item';
            
            li.innerHTML = `
                <div class="player-info">
                    <span class="player-name">${this.escapeHtml(player.name)}</span>
                    <span class="player-status ${player.status}">
                        ${this.getStatusText(player.status)}
                    </span>
                </div>
                <button class="btn btn-primary btn-small invite-btn ${player.status !== 'available' ? 'disabled' : ''}" 
                        ${player.status !== 'available' ? 'disabled' : ''}>
                    <span class="btn-icon">🎯</span>
                    دعوة
                </button>
            `;
            
            const inviteBtn = li.querySelector('.invite-btn');
            if (player.status === 'available') {
                inviteBtn.addEventListener('click', () => this.sendInvite(player.id, player.name));
            }
            
            lobbyList.appendChild(li);
        });
    }
    
    renderGameState() {
        if (!this.state.room || !this.state.room.state) return;
        
        const { state, players } = this.state.room;
        
        // تحديث معلومات الغرفة
        this.elements.roomIdDisplay.textContent = `الغرفة: ${this.state.room.id}`;
        this.elements.movesCount.textContent = `${state.moves} حركات`;
        this.elements.movesDisplay.textContent = state.moves.toString();
        
        // تحديث أسماء اللاعبين
        const playerX = players.find(p => p.symbol === 'X');
        const playerO = players.find(p => p.symbol === 'O');
        
        this.elements.playerXName.textContent = playerX ? this.escapeHtml(playerX.name) : '...';
        this.elements.playerOName.textContent = playerO ? this.escapeHtml(playerO.name) : '...';
        
        // تمييز اللاعب الحالي
        const isXActive = state.currentPlayer === 'X';
        const isOActive = state.currentPlayer === 'O';
        const isMyTurn = state.active && this.state.mySymbol === state.currentPlayer;
        
        this.elements.playerXDisplay.querySelector('.player-badge').classList.toggle('active', isXActive);
        this.elements.playerODisplay.querySelector('.player-badge').classList.toggle('active', isOActive);
        
        // تمييز دور اللاعب الحالي (نفسه)
        this.elements.playerXDisplay.querySelector('.player-badge').classList.toggle('my-turn', isXActive && this.state.mySymbol === 'X');
        this.elements.playerODisplay.querySelector('.player-badge').classList.toggle('my-turn', isOActive && this.state.mySymbol === 'O');
        
        // تحديث رسالة الحالة
        this.elements.statusMessage.querySelector('.message-text').textContent = state.message;
        
        // تحدير أيقونة الرسالة بناءً على الحالة
        let statusIcon = '🎮';
        if (state.winner) {
            statusIcon = state.winner === 'draw' ? '🎉' : '🏆';
        } else if (!state.active) {
            statusIcon = '⏸️';
        }
        this.elements.statusMessage.querySelector('.message-icon').textContent = statusIcon;
        
        // تحديث اللوحة
        this.updateBoard(state);
        
        // تحديث أزرار التحكم
        this.elements.restartButton.disabled = state.active;
        this.elements.readyButton.style.display = state.winner ? 'block' : 'none';
    }
    
    updateBoard(state) {
        state.board.forEach((symbol, index) => {
            const cell = this.cells[index];
            if (!cell) return;
            
            cell.textContent = symbol || '';
            cell.className = `cell ${symbol || ''}`;
            
            if (symbol) {
                cell.classList.add('taken');
            }
            
            // تعطيل الخلايا غير الفارغة أو عندما لا يكون دور اللاعب
            const isCellEmpty = symbol === null;
            const isMyTurn = state.active && this.state.mySymbol === state.currentPlayer;
            const isGameActive = state.active && !state.winner;
            
            cell.classList.toggle('disabled', !isCellEmpty || !isMyTurn || !isGameActive);
        });
    }
    
    renderLeaderboard() {
        const leaderboardList = this.elements.leaderboardList;
        
        if (!this.state.leaderboard || this.state.leaderboard.length === 0) {
            leaderboardList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🏆</div>
                    <p>لا توجد بيانات للمتصدرين بعد</p>
                    <small>العب بعض المباريات لتظهر في التصنيف!</small>
                </div>
            `;
            return;
        }
        
        leaderboardList.innerHTML = '';
        
        this.state.leaderboard.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            
            item.innerHTML = `
                <div class="leaderboard-rank">${index + 1}</div>
                <div class="leaderboard-player">
                    <div class="leaderboard-avatar">
                        ${player.name.charAt(0).toUpperCase()}
                    </div>
                    <span class="leaderboard-name">${this.escapeHtml(player.name)}</span>
                </div>
                <div class="leaderboard-stats">
                    <div class="leaderboard-stat">
                        <span class="leaderboard-stat-value">${player.wins}</span>
                        <span class="leaderboard-stat-label">فوز</span>
                    </div>
                    <div class="leaderboard-stat">
                        <span class="leaderboard-stat-value">${player.losses}</span>
                        <span class="leaderboard-stat-label">خسارة</span>
                    </div>
                    <div class="leaderboard-stat">
                        <span class="leaderboard-stat-value">${player.totalGames}</span>
                        <span class="leaderboard-stat-label">مباراة</span>
                    </div>
                </div>
            `;
            
            leaderboardList.appendChild(item);
        });
    }
    
    updateServerStats() {
        const stats = this.state.serverStats;
        
        this.elements.onlineCount.textContent = `👥 ${stats.onlinePlayers || 0}`;
        this.elements.roomsCount.textContent = `🚪 ${stats.activeRooms || 0}`;
        this.elements.gamesCount.textContent = `🎯 ${stats.totalGames || 0}`;
        
        this.elements.quickOnline.textContent = stats.onlinePlayers || 0;
        this.elements.quickGames.textContent = stats.activeRooms || 0;
    }
    
    // ========== دوال مساعدة ==========
    
    getStatusText(status) {
        const statusMap = {
            'available': '🟢 متاح',
            'in_game': '🔴 في لعبة',
            'awaiting_response': '🟡 بانتظار رد'
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
    
    playSound(soundName) {
        const sound = this.sounds[soundName];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => {
                console.log('🔇 تعذر تشغيل الصوت:', e);
            });
        }
    }
    
    showNotification(message, type = 'info') {
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
        
        this.elements.notificationContainer.appendChild(notification);
        
        // تشغيل صوت الإشعار
        this.playSound('notification');
        
        // إزالة الإشعار تلقائياً بعد 5 ثواني
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideInLeft 0.3s ease-in-out reverse';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 5000);
    }
    
    loadLeaderboard() {
        this.socket.emit('getLeaderboard');
        this.elements.leaderboardList.innerHTML = `
            <div class="loading-leaderboard">
                <div class="loading-spinner small"></div>
                <p>جاري تحميل بيانات المتصدرين...</p>
            </div>
        `;
    }
}

// ========== تهيئة التطبيق ==========

// الانتظار حتى تحميل DOM بالكامل
document.addEventListener('DOMContentLoaded', () => {
    // تهيئة التطبيق
    window.gameClient = new XOGameClient();
    
    // إضافة بعض التحسينات الإضافية
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && window.gameClient) {
            // تحديث البيانات عندما يعود المستخدم للتبويب
            window.gameClient.refreshLobby();
            window.gameClient.loadLeaderboard();
        }
    });
    
    // منع سلوك النموذج الافتراضي
    document.addEventListener('submit', (e) => {
        e.preventDefault();
    });
    
    console.log('🎉 تطبيق XO المحمل بنجاح!');
});

// إضافة بعض الدوال المساعدة العالمية
window.utils = {
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    },
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};