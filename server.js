const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

class XOGameServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        
        // إعدادات الإنتاج
        this.PORT = process.env.PORT || 3000;
        this.NODE_ENV = process.env.NODE_ENV || 'development';
        this.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
        
        // إعداد Socket.IO مع CORS آمن
        this.io = new Server(this.server, {
            cors: {
                origin: this.CLIENT_URL,
                methods: ["GET", "POST"],
                credentials: true
            },
            pingTimeout: 60000,
            pingInterval: 25000
        });
        
        // هياكل البيانات المحسنة
        this.players = new Map();
        this.rooms = new Map();
        this.pendingInvites = new Map();
        this.roomCounter = 1;
        this.gameStats = {
            totalGames: 0,
            totalPlayers: 0,
            totalMoves: 0,
            onlinePlayers: 0
        };
        
        // إعدادات اللعبة
        this.WINNING_LINES = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];
        
        this.MOVE_COOLDOWN = 400;
        this.MAX_NAME_LENGTH = 20;
        this.MAX_ROOM_AGE = 10 * 60 * 1000; // 10 دقائق
        
        this.initializeSecurity();
        this.initializeServer();
        this.setupSocketHandlers();
        this.startCleanupIntervals();
        
        console.log(`🎮 خادم XO المحسن - الوضع: ${this.NODE_ENV}`);
    }
    
    initializeSecurity() {
        // أمان Express
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    connectSrc: ["'self'", "ws:", "wss:"]
                }
            },
            crossOriginEmbedderPolicy: false
        }));
        
        // ضغط البيانات
        this.app.use(compression());
        
        // CORS
        this.app.use(cors({
            origin: this.CLIENT_URL,
            credentials: true
        }));
        
        // Rate Limiting
        const limiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 دقيقة
            max: 100, // 100 طلب كحد أقصى
            message: 'Too many requests from this IP'
        });
        this.app.use(limiter);
        
        // إخفاء معلومات الخادم
        this.app.disable('x-powered-by');
    }
    
    initializeServer() {
        // خدمة الملفات الثابتة
        this.app.use(express.static(path.join(__dirname, 'public'), {
            maxAge: this.NODE_ENV === 'production' ? '1h' : '0'
        }));
        
        // تحقق من صحة البيانات
        this.app.use(express.json({ limit: '10kb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10kb' }));
        
        // الصفحة الرئيسية
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
        
        // API للحالة والإحصائيات
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'running',
                environment: this.NODE_ENV,
                stats: {
                    onlinePlayers: this.players.size,
                    activeRooms: this.rooms.size,
                    pendingInvites: this.pendingInvites.size,
                    totalGames: this.gameStats.totalGames,
                    totalMoves: this.gameStats.totalMoves
                },
                server: {
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    version: '2.0.0'
                }
            });
        });
        
        // صفحة الإحصائيات
        this.app.get('/api/leaderboard', (req, res) => {
            const leaderboard = Array.from(this.players.values())
                .filter(player => player.stats && player.stats.games > 0)
                .map(player => ({
                    name: player.name,
                    wins: player.stats.wins || 0,
                    losses: player.stats.losses || 0,
                    draws: player.stats.draws || 0,
                    totalGames: player.stats.games || 0
                }))
                .sort((a, b) => b.wins - a.wins)
                .slice(0, 10);
            
            res.json({ leaderboard });
        });
        
        // صفحة 404
        this.app.use('*', (req, res) => {
            res.status(404).json({ 
                error: 'الصفحة غير موجودة',
                timestamp: new Date().toISOString()
            });
        });
        
        // معالج الأخطاء
        this.app.use((err, req, res, next) => {
            console.error('🔥 خطأ في الخادم:', err);
            res.status(500).json({ 
                error: 'حدث خطأ داخلي في الخادم',
                timestamp: new Date().toISOString()
            });
        });
    }
    
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            this.log(`🔗 لاعب متصل: ${socket.id}`, 'info');
            
            // زيادة عداد اللاعبين
            this.gameStats.onlinePlayers++;
            
            // تسجيل المعالجين
            this.registerEventHandlers(socket);
            
            // إرسال الإحصائيات الحالية
            socket.emit('serverStats', {
                onlinePlayers: this.gameStats.onlinePlayers,
                activeRooms: this.rooms.size
            });
            
            // تنظيف عند الانفصال
            socket.on('disconnect', () => this.handleDisconnect(socket));
            
            // ping/pong للتحقق من الاتصال
            socket.on('ping', (cb) => {
                if (typeof cb === 'function') {
                    cb('pong');
                }
            });
        });
    }
    
    registerEventHandlers(socket) {
        const handlers = {
            'joinLobby': (data) => this.handleJoinLobby(socket, data),
            'sendInvite': (data) => this.handleSendInvite(socket, data),
            'acceptInvite': (data) => this.handleAcceptInvite(socket, data),
            'declineInvite': (data) => this.handleDeclineInvite(socket, data),
            'makeMove': (data) => this.handleMakeMove(socket, data),
            'requestRestart': () => this.handleRestartRequest(socket),
            'leaveRoom': () => this.handleLeaveRoom(socket),
            'playerReady': () => this.handlePlayerReady(socket),
            'getLeaderboard': () => this.sendLeaderboard(socket)
        };
        
        Object.entries(handlers).forEach(([event, handler]) => {
            socket.on(event, (data) => {
                try {
                    handler(data);
                } catch (error) {
                    this.log(`خطأ في معالجة ${event}: ${error.message}`, 'error');
                    socket.emit('error', { message: 'حدث خطأ في المعالجة' });
                }
            });
        });
    }
    
    // ========== معالجة الأحداث الرئيسية ==========
    
    handleJoinLobby(socket, data) {
        const playerName = typeof data === 'string' ? data : data?.playerName;
        const sanitizedName = this.sanitizeName(playerName);
        
        // التحقق من صحة الاسم
        if (!this.validateName(sanitizedName)) {
            socket.emit('error', { message: 'الاسم يجب أن يكون بين 2 و 20 حرفاً' });
            return;
        }
        
        // التحقق من عدم وجود الاسم مسبقاً
        if (this.isNameTaken(sanitizedName, socket.id)) {
            socket.emit('error', { message: 'هذا الاسم مستخدم بالفعل' });
            return;
        }
        
        // تسجيل اللاعب
        this.players.set(socket.id, {
            id: socket.id,
            name: sanitizedName,
            status: 'available',
            roomId: null,
            isReady: false,
            lastMoveTime: 0,
            joinedAt: Date.now(),
            stats: {
                wins: 0,
                losses: 0,
                draws: 0,
                games: 0
            }
        });
        
        this.gameStats.totalPlayers++;
        
        // إرسال تأكيد الانضمام
        socket.emit('lobbyJoined', {
            playerName: sanitizedName,
            playerId: socket.id,
            leaderboard: this.getLeaderboardData()
        });
        
        this.broadcastLobbyUpdate();
        this.broadcastServerStats();
        
        this.log(`🎮 ${sanitizedName} انضم للردهة`, 'info');
    }
    
    handleSendInvite(socket, data) {
        const targetId = typeof data === 'string' ? data : data?.targetId;
        const inviter = this.players.get(socket.id);
        const target = this.players.get(targetId);
        
        if (!this.validateInvite(inviter, target)) {
            socket.emit('error', { message: 'لا يمكن إرسال الدعوة' });
            return;
        }
        
        // تحديث حالة المرسل
        inviter.status = 'awaiting_response';
        
        // حفظ الدعوة مع وقت انتهاء
        this.pendingInvites.set(targetId, {
            inviterId: socket.id,
            inviterName: inviter.name,
            timestamp: Date.now(),
            expiresAt: Date.now() + 30000 // 30 ثانية
        });
        
        // إرسال الدعوة للهدف
        this.io.to(targetId).emit('inviteReceived', {
            inviterId: socket.id,
            inviterName: inviter.name,
            expiresIn: 30000
        });
        
        this.broadcastLobbyUpdate();
        this.log(`📩 ${inviter.name} أرسل دعوة لـ ${target.name}`, 'info');
    }
    
    handleAcceptInvite(socket, data) {
        const inviterId = typeof data === 'string' ? data : data?.inviterId;
        const invite = this.pendingInvites.get(socket.id);
        const acceptor = this.players.get(socket.id);
        const inviter = this.players.get(inviterId);
        
        if (!this.validateInviteAcceptance(invite, acceptor, inviter)) {
            socket.emit('error', { message: 'الدعوة لم تعد صالحة' });
            return;
        }
        
        // تنظيف الدعوة
        this.pendingInvites.delete(socket.id);
        
        // إنشاء غرفة جديدة
        const roomId = `room_${this.roomCounter++}`;
        const room = this.createGameRoom(roomId, inviterId, socket.id);
        
        this.rooms.set(roomId, room);
        this.gameStats.totalGames++;
        
        // تحديث حالة اللاعبين
        inviter.status = 'in_game';
        inviter.roomId = roomId;
        inviter.isReady = false;
        
        acceptor.status = 'in_game';
        acceptor.roomId = roomId;
        acceptor.isReady = false;
        
        // انضمام للغرفة
        socket.join(roomId);
        this.io.sockets.sockets.get(inviterId)?.join(roomId);
        
        // بدء اللعبة
        this.startGame(roomId);
        
        this.broadcastLobbyUpdate();
        this.broadcastServerStats();
        
        this.log(`🎯 بدأت لعبة في ${roomId} بين ${inviter.name} و ${acceptor.name}`, 'info');
    }
    
    handleMakeMove(socket, data) {
        const cellIndex = typeof data === 'number' ? data : data?.cellIndex;
        const player = this.players.get(socket.id);
        
        if (!player?.roomId) {
            socket.emit('error', { message: 'أنت لست في غرفة' });
            return;
        }
        
        const room = this.rooms.get(player.roomId);
        if (!room) {
            socket.emit('error', { message: 'الغرفة غير موجودة' });
            return;
        }
        
        // التحقق من صحة الحركة
        if (!this.validateMove(socket, room, cellIndex)) {
            socket.emit('error', { message: 'حركة غير صالحة' });
            return;
        }
        
        // تحديث وقت الحركة وعداد الحركات
        player.lastMoveTime = Date.now();
        this.gameStats.totalMoves++;
        
        // تنفيذ الحركة
        this.executeMove(room, cellIndex, player);
        
        // التحقق من النتيجة
        const gameResult = this.checkGameResult(room);
        
        // تحديث إحصائيات اللاعبين إذا انتهت اللعبة
        if (gameResult && gameResult !== 'continue') {
            this.updatePlayerStats(room, gameResult);
        }
        
        // إرسال تحديث الحالة
        this.emitToRoom(room.id, 'gameStateUpdated', {
            state: room.state,
            lastMove: { cellIndex, player: player.name }
        });
        
        this.broadcastServerStats();
    }
    
    handleRestartRequest(socket) {
        const player = this.players.get(socket.id);
        if (!player?.roomId) return;
        
        const room = this.rooms.get(player.roomId);
        if (!room) return;
        
        // وضع اللاعب في حالة جاهز
        player.isReady = true;
        
        // التحقق إذا كان كلا اللاعبين جاهزين
        const allPlayersReady = Object.keys(room.players).every(playerId => 
            this.players.get(playerId)?.isReady
        );
        
        if (allPlayersReady) {
            this.restartGame(room.id);
        } else {
            // إعلام اللاعب الآخر أن الشريك يريد إعادة اللعب
            const otherPlayerId = Object.keys(room.players).find(id => id !== socket.id);
            if (otherPlayerId) {
                this.io.to(otherPlayerId).emit('playerRequestedRestart', {
                    playerName: player.name
                });
            }
        }
    }
    
    handlePlayerReady(socket) {
        const player = this.players.get(socket.id);
        if (!player?.roomId) return;
        
        const room = this.rooms.get(player.roomId);
        if (!room) return;
        
        player.isReady = true;
        
        // التحقق إذا كان كلا اللاعبين جاهزين
        const allPlayersReady = Object.keys(room.players).every(playerId => 
            this.players.get(playerId)?.isReady
        );
        
        if (allPlayersReady) {
            this.restartGame(room.id);
        }
    }
    
    handleLeaveRoom(socket) {
        const player = this.players.get(socket.id);
        if (player?.roomId) {
            this.handlePlayerExit(socket.id, player.roomId, 'left');
        }
    }
    
    handleDisconnect(socket) {
        const player = this.players.get(socket.id);
        if (player) {
            if (player.roomId) {
                this.handlePlayerExit(socket.id, player.roomId, 'disconnected');
            }
            this.players.delete(socket.id);
            this.pendingInvites.delete(socket.id);
        }
        
        // تحديث عداد اللاعبين
        this.gameStats.onlinePlayers = Math.max(0, this.gameStats.onlinePlayers - 1);
        
        this.broadcastLobbyUpdate();
        this.broadcastServerStats();
        
        this.log(`❌ لاعب غادر: ${socket.id}`, 'info');
    }
    
    // ========== منطق اللعبة الأساسي ==========
    
    createGameRoom(roomId, player1Id, player2Id) {
        const player1 = this.players.get(player1Id);
        const player2 = this.players.get(player2Id);
        
        return {
            id: roomId,
            players: {
                [player1Id]: { 
                    id: player1Id,
                    name: player1.name,
                    symbol: 'X',
                    isReady: false
                },
                [player2Id]: {
                    id: player2Id,
                    name: player2.name, 
                    symbol: 'O',
                    isReady: false
                }
            },
            state: {
                board: Array(9).fill(null),
                currentPlayer: 'X',
                winner: null,
                draw: false,
                active: true,
                moves: 0,
                message: '🎮 ابدأ اللعب! دور X'
            },
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
    }
    
    startGame(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        
        room.state.active = true;
        room.state.message = '🎮 ابدأ اللعب! دور X';
        room.lastActivity = Date.now();
        
        // إرسال بيانات بدء اللعبة لكل لاعب
        Object.keys(room.players).forEach(playerId => {
            const player = room.players[playerId];
            this.io.to(playerId).emit('gameStarted', {
                room: this.getPublicRoomData(room),
                mySymbol: player.symbol,
                opponent: this.getOpponentData(room, playerId)
            });
        });
    }
    
    executeMove(room, cellIndex, player) {
        const symbol = room.players[player.id].symbol;
        
        // تنفيذ الحركة
        room.state.board[cellIndex] = symbol;
        room.state.moves++;
        room.lastActivity = Date.now();
        
        // تبديل الدور
        room.state.currentPlayer = room.state.currentPlayer === 'X' ? 'O' : 'X';
        room.state.message = `دور ${room.state.currentPlayer}`;
    }
    
    checkGameResult(room) {
        const winner = this.calculateWinner(room.state.board);
        
        if (winner) {
            room.state.winner = winner;
            room.state.active = false;
            room.state.draw = (winner === 'draw');
            room.state.message = winner === 'draw' 
                ? '🎉 تعادل!' 
                : `🎊 فاز ${winner}!`;
                
            this.log(`🏆 إنتهت اللعبة في ${room.id}: ${room.state.message}`, 'info');
            return winner;
        }
        
        return 'continue';
    }
    
    calculateWinner(board) {
        // التحقق من الفوز
        for (const [a, b, c] of this.WINNING_LINES) {
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }
        
        // التحقق من التعادل
        if (board.every(cell => cell !== null)) {
            return 'draw';
        }
        
        return null;
    }
    
    updatePlayerStats(room, result) {
        Object.keys(room.players).forEach(playerId => {
            const player = this.players.get(playerId);
            if (player && player.stats) {
                player.stats.games++;
                
                const playerSymbol = room.players[playerId].symbol;
                
                if (result === 'draw') {
                    player.stats.draws++;
                } else if (result === playerSymbol) {
                    player.stats.wins++;
                } else {
                    player.stats.losses++;
                }
            }
        });
    }
    
    restartGame(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        
        // إعادة تعيين حالة اللعبة
        room.state.board.fill(null);
        room.state.currentPlayer = 'X';
        room.state.winner = null;
        room.state.draw = false;
        room.state.active = true;
        room.state.moves = 0;
        room.state.message = '🔄 إعادة التشغيل! دور X';
        room.lastActivity = Date.now();
        
        // إعادة تعيين جاهزية اللاعبين
        Object.keys(room.players).forEach(playerId => {
            const player = this.players.get(playerId);
            if (player) player.isReady = false;
        });
        
        this.emitToRoom(roomId, 'gameRestarted', {
            state: room.state
        });
        
        this.log(`🔄 إعادة تشغيل اللعبة في ${roomId}`, 'info');
    }
    
    // ========== إدارة اللاعبين والغرف ==========
    
    handlePlayerExit(playerId, roomId, reason) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        
        const leavingPlayer = this.players.get(playerId);
        const remainingPlayerId = Object.keys(room.players).find(id => id !== playerId);
        
        // إخطار اللاعب المتبقي
        if (remainingPlayerId) {
            const remainingPlayer = this.players.get(remainingPlayerId);
            if (remainingPlayer) {
                remainingPlayer.status = 'available';
                remainingPlayer.roomId = null;
                remainingPlayer.isReady = false;
                
                this.io.to(remainingPlayerId).emit('opponentLeft', {
                    message: reason === 'disconnected' 
                        ? 'انقطع اتصال الخصم'
                        : 'غادر الخصم الغرفة',
                    playerName: leavingPlayer?.name
                });
            }
        }
        
        // تنظيف الغرفة
        this.cleanupRoom(roomId);
        
        // تحديث حالة اللاعب المغادر
        if (leavingPlayer) {
            leavingPlayer.status = 'available';
            leavingPlayer.roomId = null;
            leavingPlayer.isReady = false;
        }
        
        this.broadcastLobbyUpdate();
        this.broadcastServerStats();
        
        this.log(`🚪 ${leavingPlayer?.name || 'لاعب'} ${reason} الغرفة ${roomId}`, 'info');
    }
    
    cleanupRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        
        // حذف الغرفة إذا لم يتبقى لاعبين
        const activePlayers = Object.keys(room.players).filter(playerId => 
            this.players.has(playerId)
        );
        
        if (activePlayers.length === 0) {
            this.rooms.delete(roomId);
            this.log(`🗑️ تم حذف الغرفة ${roomId}`, 'info');
        }
    }
    
    // ========== التحقق من الصحة والأمان ==========
    
    validateName(name) {
        return name && name.length >= 2 && name.length <= this.MAX_NAME_LENGTH;
    }
    
    isNameTaken(name, currentPlayerId) {
        return Array.from(this.players.entries()).some(([id, player]) => 
            id !== currentPlayerId && player.name.toLowerCase() === name.toLowerCase()
        );
    }
    
    validateInvite(inviter, target) {
        return inviter && 
               target && 
               inviter.status === 'available' && 
               target.status === 'available' &&
               inviter.id !== target.id;
    }
    
    validateInviteAcceptance(invite, acceptor, inviter) {
        if (!invite || !acceptor || !inviter) return false;
        if (invite.expiresAt && Date.now() > invite.expiresAt) return false;
        
        return acceptor.status === 'available' &&
               inviter.status === 'awaiting_response' &&
               invite.inviterId === inviter.id;
    }
    
    validateMove(socket, room, cellIndex) {
        // التحقق الأساسي
        if (cellIndex < 0 || cellIndex > 8) return false;
        if (!room.state.active || room.state.winner) return false;
        
        const player = room.players[socket.id];
        if (!player) return false;
        
        // التحقق من الدور
        if (player.symbol !== room.state.currentPlayer) return false;
        
        // التحقق من أن الخلية فارغة
        if (room.state.board[cellIndex] !== null) return false;
        
        // التحقق من التبريد بين الحركات
        const playerData = this.players.get(socket.id);
        const timeSinceLastMove = Date.now() - playerData.lastMoveTime;
        if (timeSinceLastMove < this.MOVE_COOLDOWN) return false;
        
        return true;
    }
    
    // ========== دوال مساعدة ==========
    
    sanitizeName(name) {
        if (typeof name !== 'string') return '';
        return name.trim()
            .substring(0, this.MAX_NAME_LENGTH)
            .replace(/[^\w\u0600-\u06FF\s\-_.]/g, '')
            .replace(/\s+/g, ' ');
    }
    
    getPublicRoomData(room) {
        return {
            id: room.id,
            players: Object.values(room.players),
            state: room.state
        };
    }
    
    getOpponentData(room, playerId) {
        const opponentId = Object.keys(room.players).find(id => id !== playerId);
        return room.players[opponentId];
    }
    
    getLeaderboardData() {
        return Array.from(this.players.values())
            .filter(player => player.stats && player.stats.games > 0)
            .map(player => ({
                name: player.name,
                wins: player.stats.wins || 0,
                losses: player.stats.losses || 0,
                draws: player.stats.draws || 0,
                totalGames: player.stats.games || 0
            }))
            .sort((a, b) => b.wins - a.wins)
            .slice(0, 10);
    }
    
    sendLeaderboard(socket) {
        socket.emit('leaderboardData', {
            leaderboard: this.getLeaderboardData()
        });
    }
    
    // ========== البث والتواصل ==========
    
    broadcastLobbyUpdate() {
        const lobbyData = Array.from(this.players.values()).map(player => ({
            id: player.id,
            name: player.name,
            status: player.status
        }));
        
        this.io.emit('lobbyUpdated', { players: lobbyData });
    }
    
    broadcastServerStats() {
        this.io.emit('serverStats', {
            onlinePlayers: this.gameStats.onlinePlayers,
            activeRooms: this.rooms.size,
            totalGames: this.gameStats.totalGames
        });
    }
    
    emitToPlayer(playerId, event, data) {
        this.io.to(playerId).emit(event, data);
    }
    
    emitToRoom(roomId, event, data) {
        this.io.to(roomId).emit(event, data);
    }
    
    // ========== التنظيف الدوري ==========
    
    startCleanupIntervals() {
        // تنظيف الدعوات المنتهية كل 30 ثانية
        setInterval(() => this.cleanupExpiredInvites(), 30000);
        
        // تنظيف الغرف الخاملة كل دقيقة
        setInterval(() => this.cleanupInactiveRooms(), 60000);
        
        // تنظيف اللاعبين المتوقفين كل 5 دقائق
        setInterval(() => this.cleanupInactivePlayers(), 300000);
        
        // بث الإحصائيات كل 30 ثانية
        setInterval(() => this.broadcastServerStats(), 30000);
    }
    
    cleanupExpiredInvites() {
        const now = Date.now();
        for (const [targetId, invite] of this.pendingInvites.entries()) {
            if (now > invite.expiresAt) {
                const inviter = this.players.get(invite.inviterId);
                if (inviter && inviter.status === 'awaiting_response') {
                    inviter.status = 'available';
                }
                this.pendingInvites.delete(targetId);
                this.log(`⏰ انتهت صلاحية دعوة لـ ${targetId}`, 'debug');
            }
        }
    }
    
    cleanupInactiveRooms() {
        const now = Date.now();
        for (const [roomId, room] of this.rooms.entries()) {
            // حذف الغرف الخاملة لمدة 10 دقائق
            if (now - room.lastActivity > this.MAX_ROOM_AGE) {
                this.rooms.delete(roomId);
                this.log(`🧹 تنظيف غرفة خاملة: ${roomId}`, 'debug');
            }
        }
    }
    
    cleanupInactivePlayers() {
        // يمكن إضافة تنظيف للاعبين المتوقفين إذا لزم الأمر
        this.log(`👥 تنظيف الذاكرة - اللاعبون: ${this.players.size}, الغرف: ${this.rooms.size}`, 'debug');
    }
    
    // ========== التسجيل والمراقبة ==========
    
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        console.log(logMessage);
        
        // في الإنتاج، يمكن إضافة كتابة في ملف
        if (this.NODE_ENV === 'production') {
            // يمكن إضافة كتابة في ملف log هنا
        }
    }
    
    // ========== تشغيل الخادم ==========
    
    start() {
        this.server.listen(this.PORT, '0.0.0.0', () => {
            this.log(`🚀 خادم XO المحسن يعمل على PORT: ${this.PORT}`, 'info');
            this.log(`🌐 الوضع: ${this.NODE_ENV}`, 'info');
            this.log(`🔗 العنوان: ${this.CLIENT_URL}`, 'info');
            
            if (this.NODE_ENV === 'production') {
                this.log('🛡️  وضع الإنتاج مفعل - الأمان مشدد', 'info');
            }
        });
        
        // معالجة إغلاق الخادم بشكل أنيق
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }
    
    shutdown() {
        this.log('🛑 إغلاق الخادم...', 'info');
        
        // إخطار جميع العملاء
        this.io.emit('serverShutdown', { message: 'يتم إغلاق الخادم للصيانة' });
        
        // إعطاء وقت للإغلاق
        setTimeout(() => {
            process.exit(0);
        }, 5000);
    }
}

// تشغيل الخادم
const gameServer = new XOGameServer();
gameServer.start();

module.exports = XOGameServer;