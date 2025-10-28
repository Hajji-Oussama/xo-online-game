// ===============================================
// 🚀 XO Game Server - النسخة المحسنة والمؤمنة
// ===============================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// 🆕 استيراد الأنظمة الجديدة
const SecurityManager = require('./managers/SecurityManager');
const GameManager = require('./managers/GameManager');
const PlayerManager = require('./managers/PlayerManager');
const AntiCheatSystem = require('./systems/AntiCheatSystem');
const MonitoringSystem = require('./systems/MonitoringSystem');

class XOGameServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: process.env.CLIENT_URL || "*",
                methods: ["GET", "POST"]
            },
            pingTimeout: 60000,
            pingInterval: 25000
        });

        // 🆕 تهيئة الأنظمة
        this.security = new SecurityManager();
        this.gameManager = new GameManager();
        this.playerManager = new PlayerManager();
        this.antiCheat = new AntiCheatSystem();
        this.monitoring = new MonitoringSystem();

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.startBackgroundTasks();

        console.log('🛡️  خادم XO المحسن - جاهز للتشغيل');
    }

    setupMiddleware() {
        // 🔒 إعدادات الأمان
        this.security.setupSecurityMiddleware(this.app);
        
        // 📦 ضغط البيانات
        this.app.use(compression());
        
        // 🗂️ خدم الملفات الثابتة
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        // 📊 معدل الطلبات
        const limiter = rateLimit({
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
            max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
            message: '🎯 تم تجاوز الحد المسموح من الطلبات'
        });
        this.app.use(limiter);
    }

    setupRoutes() {
        // 🏠 الصفحة الرئيسية
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // ❤️ صفحة الصحة
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'OK',
                players: this.playerManager.getPlayerCount(),
                rooms: this.gameManager.getRoomCount(),
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });

        // 📈 إحصائيات السيرفر
        this.app.get('/stats', (req, res) => {
            res.json(this.monitoring.getServerStats());
        });

        // 🎮 حالة اللعبة (للمراقبة)
        this.app.get('/debug/state', (req, res) => {
            if (process.env.NODE_ENV === 'development') {
                res.json({
                    players: Array.from(this.playerManager.players.values()),
                    rooms: Array.from(this.gameManager.rooms.values()),
                    activities: this.monitoring.getRecentActivities()
                });
            } else {
                res.status(403).json({ error: 'غير مسموح في الوضع الإنتاجي' });
            }
        });
    }

    setupSocketHandlers() {
        // 🔐 أمان السوكت
        this.security.setupSocketSecurity(this.io);

        this.io.on('connection', (socket) => {
            console.log(`🔗 لاعب متصل: ${socket.id}`);
            
            // 🆕 تسجيل النشاط
            this.monitoring.logActivity(socket.id, 'connection', {});

            // 👤 أحداث اللاعب
            socket.on('joinLobby', (data) => this.handleJoinLobby(socket, data));
            socket.on('sendInvite', (data) => this.handleSendInvite(socket, data));
            socket.on('acceptInvite', (data) => this.handleAcceptInvite(socket, data));
            socket.on('declineInvite', (data) => this.handleDeclineInvite(socket, data));

            // 🎮 أحداث اللعبة
            socket.on('makeMove', (data) => this.handleMakeMove(socket, data));
            socket.on('requestRestart', (data) => this.handleRequestRestart(socket, data));
            socket.on('playerReady', (data) => this.handlePlayerReady(socket, data));
            socket.on('leaveRoom', (data) => this.handleLeaveRoom(socket, data));

            // 🔄 أحداث النظام
            socket.on('getLobbyUpdate', () => this.handleLobbyUpdate(socket));
            socket.on('getLeaderboard', () => this.handleGetLeaderboard(socket));
            socket.on('ping', (callback) => callback('pong'));

            // 🚪 أحداث الانفصال
            socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));
            socket.on('forceDisconnect', () => this.handleForceDisconnect(socket));
        });
    }

    // 👤 معالجة أحداث اللاعبين
    async handleJoinLobby(socket, data) {
        try {
            // 🆕 التحقق من الأمان أولاً
            await this.security.validateRequest(socket, 'joinLobby', data);
            
            const player = await this.playerManager.handlePlayerJoin(socket, data.playerName);
            this.monitoring.logActivity(socket.id, 'join_lobby', { playerName: data.playerName });
            
            socket.emit('lobbyJoined', {
                playerName: player.name,
                leaderboard: this.gameManager.getLeaderboard(),
                serverStats: this.monitoring.getServerStats()
            });

            this.broadcastLobbyUpdate();
            
        } catch (error) {
            socket.emit('error', { message: error.message });
            this.monitoring.logActivity(socket.id, 'join_lobby_failed', { error: error.message });
        }
    }

    async handleSendInvite(socket, data) {
        try {
            await this.security.validateRequest(socket, 'sendInvite', data);
            
            const result = await this.playerManager.handleSendInvite(socket.id, data.targetId);
            this.monitoring.logActivity(socket.id, 'send_invite', { targetId: data.targetId });
            
            socket.emit('inviteSent', { targetName: result.targetName });
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    }

    async handleAcceptInvite(socket, data) {
        try {
            await this.security.validateRequest(socket, 'acceptInvite', data);
            
            const gameRoom = await this.gameManager.handleAcceptInvite(socket.id, data.inviterId);
            this.monitoring.logActivity(socket.id, 'accept_invite', { inviterId: data.inviterId });
            
            // إشعار اللاعبين ببدء اللعبة
            this.io.to(gameRoom.id).emit('gameStarted', {
                room: gameRoom,
                players: gameRoom.players,
                mySymbol: gameRoom.players.find(p => p.id === socket.id)?.symbol
            });
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    }

    // 🎮 معالجة أحداث اللعبة
    async handleMakeMove(socket, data) {
        try {
            await this.security.validateRequest(socket, 'makeMove', data);
            
            // 🆕 التحقق من الغش
            await this.antiCheat.validateMove(socket.id, data.cellIndex);
            
            const gameState = await this.gameManager.handleMakeMove(socket.id, data.cellIndex);
            this.monitoring.logActivity(socket.id, 'make_move', { cellIndex: data.cellIndex });
            
            // إرسال تحديث اللعبة للغرفة
            this.io.to(gameState.roomId).emit('gameStateUpdated', {
                state: gameState,
                moves: gameState.moves
            });

            // 🆕 التحقق من انتهاء اللعبة
            if (gameState.winner || gameState.isDraw) {
                await this.handleGameCompletion(gameState.roomId, gameState.winner);
            }
            
        } catch (error) {
            socket.emit('error', { message: error.message });
            this.monitoring.logActivity(socket.id, 'invalid_move', { error: error.message });
        }
    }

    async handleGameCompletion(roomId, winner) {
        try {
            const results = await this.gameManager.handleGameCompletion(roomId, winner);
            this.monitoring.logActivity('system', 'game_completed', { roomId, winner });
            
            // تحديث الإحصائيات
            await this.gameManager.updateLeaderboard(results.players);
            
            // إشعار اللاعبين
            this.io.to(roomId).emit('gameCompleted', {
                winner: winner,
                isDraw: winner === 'draw',
                stats: results.stats,
                leaderboard: this.gameManager.getLeaderboard()
            });
            
        } catch (error) {
            console.error('❌ خطأ في إنهاء اللعبة:', error);
        }
    }

    // 🔄 معالجة الأحداث العامة
    handleLobbyUpdate(socket) {
        const lobbyData = {
            players: this.playerManager.getLobbyPlayers(),
            serverStats: this.monitoring.getServerStats()
        };
        socket.emit('lobbyUpdated', lobbyData);
    }

    handleGetLeaderboard(socket) {
        socket.emit('leaderboardData', {
            leaderboard: this.gameManager.getLeaderboard()
        });
    }

    // 🚪 معالجة الانفصال
    async handleDisconnect(socket, reason) {
        console.log(`🚪 لاعب انقطع: ${socket.id} - السبب: ${reason}`);
        
        try {
            await this.playerManager.handlePlayerLeave(socket.id, reason);
            this.monitoring.logActivity(socket.id, 'disconnect', { reason });
            
            this.broadcastLobbyUpdate();
            
        } catch (error) {
            console.error('❌ خطأ في معالجة الانفصال:', error);
        }
    }

    async handleForceDisconnect(socket) {
        await this.playerManager.handlePlayerLeave(socket.id, 'تم طلب الفصل');
        socket.disconnect(true);
    }

    // 📢 بث التحديثات
    broadcastLobbyUpdate() {
        const lobbyData = {
            players: this.playerManager.getLobbyPlayers(),
            serverStats: this.monitoring.getServerStats()
        };
        this.io.emit('lobbyUpdated', lobbyData);
    }

    // ⚙️ المهام الخلفية
    startBackgroundTasks() {
        // تنظيف الذاكرة كل 5 دقائق
        setInterval(() => {
            this.playerManager.cleanupInactivePlayers();
            this.gameManager.cleanupOldRooms();
        }, 300000);

        // 🆕 مراقبة الأداء كل 30 ثانية
        setInterval(() => {
            this.monitoring.monitorPerformance();
        }, 30000);

        // 🆕 تحديث الإحصائيات كل دقيقة
        setInterval(() => {
            this.broadcastLobbyUpdate();
        }, 60000);

        console.log('🔄 المهام الخلفية - مفعلة');
    }

    // 🚀 تشغيل السيرفر
    start() {
        const PORT = process.env.PORT || 3000;
        const HOST = process.env.HOST || '0.0.0.0';

        this.server.listen(PORT, HOST, () => {
            console.log('🎮 خادم XO المحسن - الوضع:', process.env.NODE_ENV || 'development');
            console.log('🚀 يعمل على PORT:', PORT);
            console.log('🌐 العنوان:', process.env.CLIENT_URL || `http://localhost:${PORT}`);
            console.log('🛡️  وضع الإنتاج:', process.env.NODE_ENV === 'production' ? 'مفعل' : 'غير مفعل');
        });
    }
}

// تشغيل السيرفر
const gameServer = new XOGameServer();
gameServer.start();

module.exports = XOGameServer;