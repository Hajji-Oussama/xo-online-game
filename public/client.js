// ===============================================
// 🎮 XO Game Client - النسخة المحسنة والمؤمنة
// ===============================================

class XOGameClient {
    constructor() {
        this.config = {
            RECONNECTION_ATTEMPTS: 5,
            RECONNECTION_DELAY: 2000,
            PING_INTERVAL: 30000,
            MOVE_COOLDOWN: 400
        };

        this.initializeSocket();
        this.initializeState();
        this.initializeDOM();
        this.setupEventHandlers();
        
        console.log('🎮 عميل XO المحسن - جاهز');
    }

    initializeSocket() {
        this.socket = io({
            transports: ['websocket', 'polling'],
            timeout: 10000,
            reconnectionAttempts: this.config.RECONNECTION_ATTEMPTS,
            reconnectionDelay: this.config.RECONNECTION_DELAY
        });

        this.setupSocketHandlers();
    }

    initializeState() {
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
            },
            lastMoveTime: 0,
            isReconnecting: false
        };
    }

    // 🆕 معالجات السوكت المحسنة
    setupSocketHandlers() {
        // 🔗 أحداث الاتصال
        this.socket.on('connect', () => this.onConnect());
        this.socket.on('disconnect', (reason) => this.onDisconnect(reason));
        this.socket.on('connect_error', (error) => this.onConnectError(error));
        this.socket.on('reconnect_attempt', () => this.onReconnectAttempt());
        this.socket.on('reconnect_failed', () => this.onReconnectFailed());

        // 👤 أحداث اللاعب
        this.socket.on('lobbyJoined', (data) => this.onLobbyJoined(data));
        this.socket.on('lobbyUpdated', (data) => this.onLobbyUpdate(data));
        this.socket.on('inviteReceived', (data) => this.onInviteReceived(data));
        this.socket.on('inviteSent', (data) => this.onInviteSent(data));

        // 🎮 أحداث اللعبة
        this.socket.on('gameStarted', (data) => this.onGameStarted(data));
        this.socket.on('gameStateUpdated', (data) => this.onGameStateUpdate(data));
        this.socket.on('gameCompleted', (data) => this.onGameCompleted(data));
        this.socket.on('playerRequestedRestart', (data) => this.onRestartRequest(data));
        this.socket.on('opponentLeft', (data) => this.onOpponentLeft(data));

        // 📊 أحداث النظام
        this.socket.on('serverStats', (data) => this.onServerStats(data));
        this.socket.on('leaderboardData', (data) => this.onLeaderboardData(data));
        this.socket.on('error', (data) => this.onError(data));
    }

    // 🆕 معالجة الأحداث المحسنة
    async onGameStarted(data) {
        if (!data?.mySymbol || !data?.room) {
            this.showNotification('بيانات اللعبة غير مكتملة', 'error');
            return;
        }

        this.state.mySymbol = data.mySymbol;
        this.state.room = data.room;
        this.state.opponent = data.opponent;

        this.showScreen('game');
        this.renderGameState();
        this.startGameTimer();

        this.showNotification(`بدأت اللعبة! أنت ${data.mySymbol}`, 'success');
        this.playSound('notification');
    }

    async onGameStateUpdate(data) {
        if (!data?.state || !this.state.room) return;

        this.state.room.state = data.state;
        this.renderGameState();

        // 🆕 تحديث وقت آخر حركة
        this.state.lastMoveTime = Date.now();

        // تشغيل الأصوات المناسبة
        if (data.state.winner) {
            if (data.state.winner === 'draw') {
                this.playSound('draw');
            } else if (data.state.winner === this.state.mySymbol) {
                this.playSound('win');
            }
        }
    }

    // 🆕 إدارة الحركات المحسنة
    async handleCellClick(index) {
        if (!this.canMakeMove()) {
            this.showNotification('لا يمكنك الحركة الآن', 'warning');
            return;
        }

        // 🆕 التحقق من التبريد
        if (Date.now() - this.state.lastMoveTime < this.config.MOVE_COOLDOWN) {
            this.showNotification('انتظر قليلاً قبل الحركة التالية', 'warning');
            return;
        }

        try {
            this.socket.emit('makeMove', { 
                cellIndex: index,
                roomId: this.state.room.id,
                timestamp: Date.now()
            });
            
            this.playSound('move');
            this.state.lastMoveTime = Date.now();
            
        } catch (error) {
            this.showNotification('فشل إرسال الحركة', 'error');
        }
    }

    canMakeMove() {
        return this.state.room && 
               this.state.room.state && 
               this.state.room.state.active && 
               !this.state.room.state.winner &&
               this.state.mySymbol === this.state.room.state.currentPlayer;
    }

    // 🆕 إدارة الاتصال المحسنة
    onConnect() {
        console.log('✅ متصل بالخادم بنجاح');
        this.updateConnectionStatus(true);
        this.showNotification('تم الاتصال بالخادم', 'success');
        
        if (this.state.isReconnecting) {
            this.state.isReconnecting = false;
            this.rejoinSession();
        }
    }

    onDisconnect(reason) {
        console.log('🔌 انقطع الاتصال:', reason);
        this.updateConnectionStatus(false);
        
        if (reason === 'io server disconnect') {
            this.showNotification('تم الفصل من الخادم', 'warning');
        } else {
            this.showNotification('انقطع الاتصال - جاري إعادة المحاولة...', 'error');
        }
    }

    onReconnectAttempt() {
        console.log('🔄 جاري إعادة الاتصال...');
        this.state.isReconnecting = true;
        this.showNotification('جاري إعادة الاتصال...', 'warning');
    }

    // 🆕 إعادة الانضمام للجلسة
    rejoinSession() {
        if (this.state.player) {
            this.socket.emit('rejoinSession', { 
                playerName: this.state.player.name 
            });
            this.showNotification('تم استئناف الجلسة', 'success');
        }
    }

    // 🆕 التحسينات الأمنية
    validateAndSanitizeInput(input) {
        if (typeof input !== 'string') return '';
        
        // إزالة الأحخاص الخاصة
        return input
            .replace(/[<>'"&;{}()\[\]]/g, '')
            .substring(0, 20) // حد أقصى 20 حرف
            .trim();
    }

    joinLobby() {
        const playerName = this.cache.elements.playerNameInput?.value.trim();
        const sanitizedName = this.validateAndSanitizeInput(playerName);
        
        if (!this.validateName(sanitizedName)) {
            this.showNotification('الرجاء إدخال اسم صحيح (2-20 حرفاً)', 'error');
            return;
        }

        this.setLoadingState(true);
        this.socket.emit('joinLobby', { playerName: sanitizedName });
    }

    // 🆕 مراقبة الأداء
    startPerformanceMonitoring() {
        // مراقبة استخدام الذاكرة
        setInterval(() => {
            if (performance.memory) {
                const usedMB = performance.memory.usedJSHeapSize / 1024 / 1024;
                if (usedMB > 50) {
                    console.warn('⚠️  استخدام عالي للذاكرة في المتصفح:', usedMB + 'MB');
                }
            }
        }, 30000);

        // مراقبة FPS
        this.monitorFPS();
    }

    monitorFPS() {
        let frameCount = 0;
        let lastTime = performance.now();
        
        const checkFPS = () => {
            frameCount++;
            const currentTime = performance.now();
            
            if (currentTime - lastTime >= 1000) {
                const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
                
                if (fps < 30) {
                    console.warn('⚠️  انخفاض في أداء الواجهة:', fps + ' FPS');
                }
                
                frameCount = 0;
                lastTime = currentTime;
            }
            
            requestAnimationFrame(checkFPS);
        };
        
        checkFPS();
    }
}

// تشغيل العميل
document.addEventListener('DOMContentLoaded', () => {
    window.gameClient = new XOGameClient();
    
    // إخفاء شاشة التحميل
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        const mainContainer = document.querySelector('.container');
        
        if (loadingScreen) loadingScreen.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'block';
    }, 1000);

    console.log('🎉 XO Game Client - محمل بنجاح!');
});