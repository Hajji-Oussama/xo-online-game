// ===============================================
// 🚀 XO Game Server - النسخة المحسنة والكاملة
// ===============================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

class XOGameServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
            pingTimeout: 60000,
            pingInterval: 25000
        });

        // حالة السيرفر
        this.players = new Map();
        this.rooms = new Map();
        this.lobbyPlayers = new Set();
        this.playerInvites = new Map();
        this.gameStats = {
            totalGames: 0,
            totalMoves: 0,
            startTime: Date.now()
        };

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        
        console.log('🎮 خادم XO المحسن - جاهز للتشغيل');
    }

    setupMiddleware() {
        // 📦 خدم الملفات الثابتة
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        // 📝 تحقق من حجم البيانات
        this.app.use(express.json({ limit: '10kb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10kb' }));
        
        // 🔧 CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            next();
        });
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
                players: this.players.size,
                rooms: this.rooms.size,
                totalGames: this.gameStats.totalGames,
                uptime: Math.floor((Date.now() - this.gameStats.startTime) / 1000)
            });
        });

        // 📊 إحصائيات السيرفر
        this.app.get('/api/stats', (req, res) => {
            res.json(this.getServerStats());
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`🔗 لاعب متصل: ${socket.id}`);
            
            // 👤 أحداث اللاعب
            socket.on('joinLobby', (data) => this.handleJoinLobby(socket, data));
            socket.on('sendInvite', (data) => this.handleSendInvite(socket, data));
            socket.on('acceptInvite', (data) => this.handleAcceptInvite(socket, data));
            socket.on('declineInvite', (data) => this.handleDeclineInvite(socket, data));

            // 🎮 أحداث اللعبة
            socket.on('makeMove', (data) => this.handleMakeMove(socket, data));
            socket.on('requestRestart', () => this.handleRequestRestart(socket));
            socket.on('playerReady', () => this.handlePlayerReady(socket));
            socket.on('leaveRoom', () => this.handleLeaveRoom(socket));

            // 🔄 أحداث النظام
            socket.on('getLobbyUpdate', () => this.handleLobbyUpdate(socket));
            socket.on('getLeaderboard', () => this.handleGetLeaderboard(socket));
            socket.on('ping', (callback) => {
                if (typeof callback === 'function') {
                    callback('pong');
                }
            });

            // 🚪 أحداث الانفصال
            socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));
        });
    }

    // 👤 معالجة أحداث اللاعبين
    async handleJoinLobby(socket, data) {
        try {
            if (!this.validatePlayerName(data.playerName)) {
                socket.emit('error', { message: 'اسم اللاعب غير صالح (2-20 حرف)' });
                return;
            }

            // منع الأسماء المكررة
            if (this.isDuplicateName(data.playerName)) {
                socket.emit('error', { message: 'الاسم مستخدم بالفعل' });
                return;
            }

            const player = {
                id: socket.id,
                name: data.playerName.trim(),
                socket: socket,
                status: 'available',
                joinedAt: Date.now(),
                lastActivity: Date.now()
            };

            this.players.set(socket.id, player);
            this.lobbyPlayers.add(socket.id);

            socket.emit('lobbyJoined', {
                playerName: player.name,
                leaderboard: this.getLeaderboard(),
                serverStats: this.getServerStats()
            });

            this.broadcastLobbyUpdate();
            console.log(`👤 ${player.name} انضم للردهة`);
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    }

    async handleSendInvite(socket, data) {
        try {
            const sender = this.players.get(socket.id);
            const target = this.players.get(data.targetId);

            if (!sender || !target) {
                socket.emit('error', { message: 'اللاعب غير موجود' });
                return;
            }

            // منع إرسال دعوة لنفسك
            if (sender.id === target.id) {
                socket.emit('error', { message: 'لا يمكن إرسال دعوة لنفسك' });
                return;
            }

            if (sender.status !== 'available' || target.status !== 'available') {
                socket.emit('error', { message: 'اللاعب غير متاح حالياً' });
                return;
            }

            // التحقق من وجود دعوة pending
            if (this.hasPendingInvite(sender.id, target.id)) {
                socket.emit('error', { message: 'لديك دعوة pending لهذا اللاعب' });
                return;
            }

            // إنشاء دعوة
            const inviteId = this.generateInviteId();
            this.playerInvites.set(inviteId, {
                id: inviteId,
                senderId: sender.id,
                targetId: target.id,
                senderName: sender.name,
                timestamp: Date.now(),
                status: 'pending'
            });

            // إرسال الدعوة للهدف
            target.socket.emit('inviteReceived', {
                inviterId: sender.id,
                inviterName: sender.name,
                inviteId: inviteId
            });

            socket.emit('inviteSent', { 
                targetName: target.name,
                message: `تم إرسال دعوة إلى ${target.name}`
            });

            console.log(`📨 ${sender.name} أرسل دعوة لـ ${target.name}`);
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    }

    async handleAcceptInvite(socket, data) {
        try {
            const invite = this.playerInvites.get(data.inviteId);
            if (!invite || invite.targetId !== socket.id) {
                socket.emit('error', { message: 'الدعوة غير موجودة أو منتهية' });
                return;
            }

            const sender = this.players.get(invite.senderId);
            const acceptor = this.players.get(socket.id);

            if (!sender || !acceptor) {
                socket.emit('error', { message: 'اللاعب غير موجود' });
                return;
            }

            // تحديث حالة الدعوة
            invite.status = 'accepted';
            
            // تحديث حالة اللاعبين
            sender.status = 'in_game';
            acceptor.status = 'in_game';

            // إنشاء غرفة جديدة
            const room = this.createRoom(sender, acceptor);
            
            // تنظيف الدعوات
            this.cleanupPlayerInvites(sender.id);
            this.cleanupPlayerInvites(acceptor.id);

            // إشعار اللاعبين ببدء اللعبة
            this.io.to(room.id).emit('gameStarted', {
                room: room,
                players: room.players,
                mySymbol: room.players.find(p => p.id === socket.id)?.symbol
            });

            this.broadcastLobbyUpdate();
            console.log(`✅ ${acceptor.name} قبل دعوة ${sender.name}`);
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    }

    async handleDeclineInvite(socket, data) {
        try {
            const invite = this.playerInvites.get(data.inviteId);
            if (!invite) return;

            const sender = this.players.get(invite.senderId);
            if (sender) {
                sender.socket.emit('inviteDeclined', {
                    targetName: this.players.get(socket.id)?.name
                });
            }

            this.playerInvites.delete(data.inviteId);
            console.log(`❌ دعوة مرفوضة من ${socket.id}`);
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    }

    // 🎮 معالجة أحداث اللعبة
    async handleMakeMove(socket, data) {
        try {
            const room = this.findPlayerRoom(socket.id);
            if (!room) {
                socket.emit('error', { message: 'اللاعب ليس في غرفة' });
                return;
            }

            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                socket.emit('error', { message: 'اللاعب ليس في هذه الغرفة' });
                return;
            }

            // التحقق من صحة الحركة
            if (!this.validateMove(room, player, data.cellIndex)) {
                socket.emit('error', { message: 'حركة غير صالحة' });
                return;
            }

            // تنفيذ الحركة
            room.state.board[data.cellIndex] = room.state.currentPlayer;
            room.state.moves++;
            room.lastActivity = Date.now();
            this.gameStats.totalMoves++;

            // التحقق من الفوز
            const winner = this.checkWinner(room.state.board);
            if (winner) {
                room.state.winner = winner;
                room.state.active = false;
                room.state.message = winner === 'draw' ? 'تعادل!' : `فاز ${winner}!`;
                this.gameStats.totalGames++;
                
                // تحديث إحصائيات اللاعبين
                this.updatePlayerStats(room, winner);
            } else {
                // تبديل اللاعب
                room.state.currentPlayer = room.state.currentPlayer === 'X' ? 'O' : 'X';
                room.state.message = `دور اللاعب ${room.state.currentPlayer}`;
            }

            // إرسال تحديث اللعبة للغرفة
            this.io.to(room.id).emit('gameStateUpdated', {
                state: room.state,
                moves: room.state.moves
            });

            // إذا انتهت اللعبة، إرسال النتائج
            if (room.state.winner) {
                setTimeout(() => {
                    this.io.to(room.id).emit('gameCompleted', {
                        winner: room.state.winner,
                        isDraw: room.state.winner === 'draw',
                        leaderboard: this.getLeaderboard()
                    });
                }, 2000);
            }
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    }

    // 🔧 الأدوات المساعدة
    validatePlayerName(name) {
        if (!name || typeof name !== 'string') return false;
        if (name.length < 2 || name.length > 20) return false;
        const validPattern = /^[\p{L}\p{N}\s_-]+$/u;
        return validPattern.test(name);
    }

    isDuplicateName(name) {
        for (let player of this.players.values()) {
            if (player.name.toLowerCase() === name.toLowerCase()) {
                return true;
            }
        }
        return false;
    }

    validateMove(room, player, cellIndex) {
        if (!room.state.active) return false;
        if (room.state.currentPlayer !== player.symbol) return false;
        if (room.state.board[cellIndex] !== null) return false;
        if (cellIndex < 0 || cellIndex > 8) return false;
        return true;
    }

    checkWinner(board) {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // صفوف
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // أعمدة
            [0, 4, 8], [2, 4, 6]             // أقطار
        ];

        for (let line of lines) {
            const [a, b, c] = line;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }

        if (board.every(cell => cell !== null)) {
            return 'draw';
        }

        return null;
    }

    createRoom(player1, player2) {
        const roomId = this.generateRoomId();
        
        const room = {
            id: roomId,
            players: [
                { ...player1, symbol: 'X', ready: false },
                { ...player2, symbol: 'O', ready: false }
            ],
            state: this.initializeGameState(),
            createdAt: Date.now(),
            lastActivity: Date.now()
        };

        this.rooms.set(roomId, room);

        // انضمام اللاعبين للغرفة في Socket.IO
        player1.socket.join(roomId);
        player2.socket.join(roomId);

        console.log(`🆕 غرفة جديدة: ${roomId} - ${player1.name} vs ${player2.name}`);
        return room;
    }

    initializeGameState() {
        return {
            board: Array(9).fill(null),
            currentPlayer: 'X',
            winner: null,
            isDraw: false,
            active: true,
            moves: 0,
            message: 'اللاعب X يبدأ'
        };
    }

    findPlayerRoom(playerId) {
        for (let room of this.rooms.values()) {
            if (room.players.some(player => player.id === playerId)) {
                return room;
            }
        }
        return null;
    }

    hasPendingInvite(senderId, targetId) {
        for (let invite of this.playerInvites.values()) {
            if (invite.senderId === senderId && 
                invite.targetId === targetId && 
                invite.status === 'pending') {
                return true;
            }
        }
        return false;
    }

    cleanupPlayerInvites(playerId) {
        for (let [inviteId, invite] of this.playerInvites) {
            if (invite.senderId === playerId || invite.targetId === playerId) {
                this.playerInvites.delete(inviteId);
            }
        }
    }

    updatePlayerStats(room, winner) {
        // يمكن تطوير هذا لاحقاً لإضافة إحصائيات متقدمة
        room.players.forEach(player => {
            player.lastActivity = Date.now();
        });
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    generateInviteId() {
        return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getLeaderboard() {
        // يمكن تطوير هذا لاحقاً
        return [
            { name: 'أحمد', wins: 5, losses: 2, draws: 1 },
            { name: 'محمد', wins: 4, losses: 3, draws: 0 },
            { name: 'فاطمة', wins: 3, losses: 1, draws: 2 }
        ];
    }

    getServerStats() {
        const uptime = Math.floor((Date.now() - this.gameStats.startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        
        return {
            onlinePlayers: this.players.size,
            activeRooms: this.rooms.size,
            totalGames: this.gameStats.totalGames,
            totalMoves: this.gameStats.totalMoves,
            uptime: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        };
    }

    // 🔄 معالجة الأحداث العامة
    handleLobbyUpdate(socket) {
        socket.emit('lobbyUpdated', {
            players: this.getLobbyPlayers(),
            serverStats: this.getServerStats()
        });
    }

    handleGetLeaderboard(socket) {
        socket.emit('leaderboardData', {
            leaderboard: this.getLeaderboard()
        });
    }

    getLobbyPlayers() {
        return Array.from(this.lobbyPlayers)
            .map(playerId => {
                const player = this.players.get(playerId);
                return player ? {
                    id: player.id,
                    name: player.name,
                    status: player.status
                } : null;
            })
            .filter(player => player !== null && player.status === 'available');
    }

    // 🚪 معالجة الانفصال
    async handleDisconnect(socket, reason) {
        console.log(`🚪 لاعب انقطع: ${socket.id} - ${reason}`);
        
        const player = this.players.get(socket.id);
        if (player) {
            // إذا كان في غرفة، معالجة مغادرته
            const room = this.findPlayerRoom(socket.id);
            if (room) {
                this.handlePlayerLeaveRoom(room, socket.id);
            }

            // تنظيف البيانات
            this.players.delete(socket.id);
            this.lobbyPlayers.delete(socket.id);
            this.cleanupPlayerInvites(socket.id);
        }

        this.broadcastLobbyUpdate();
    }

    handlePlayerLeaveRoom(room, playerId) {
        const leavingPlayer = room.players.find(p => p.id === playerId);
        room.players = room.players.filter(p => p.id !== playerId);
        
        if (room.players.length === 0) {
            // لا يوجد لاعبين، حذف الغرفة
            this.rooms.delete(room.id);
        } else {
            // إشعار اللاعب المتبقي
            const remainingPlayer = room.players[0];
            remainingPlayer.socket.emit('opponentLeft', {
                message: `${leavingPlayer?.name || 'الخصم'} غادر الغرفة`,
                roomClosed: false
            });
            
            // إعادة اللاعب المتبقي للردهة
            remainingPlayer.status = 'available';
            this.lobbyPlayers.add(remainingPlayer.id);
        }
    }

    // 📢 بث التحديثات
    broadcastLobbyUpdate() {
        const lobbyData = {
            players: this.getLobbyPlayers(),
            serverStats: this.getServerStats()
        };
        this.io.emit('lobbyUpdated', lobbyData);
    }

    // معالجات أخرى
    handleRequestRestart(socket) {
        const room = this.findPlayerRoom(socket.id);
        if (room && !room.state.active) {
            // إعادة تشغيل اللعبة
            room.state = this.initializeGameState();
            room.players.forEach(player => {
                player.ready = false;
                // تبديل الرموز
                player.symbol = player.symbol === 'X' ? 'O' : 'X';
            });
            
            this.io.to(room.id).emit('gameRestarted', {
                state: room.state,
                players: room.players
            });
        }
    }

    handlePlayerReady(socket) {
        const room = this.findPlayerRoom(socket.id);
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.ready = true;
                
                // إذا كان كلا اللاعبين جاهزين
                if (room.players.every(p => p.ready)) {
                    this.handleRequestRestart(socket);
                }
            }
        }
    }

    handleLeaveRoom(socket) {
        const room = this.findPlayerRoom(socket.id);
        if (room) {
            this.handlePlayerLeaveRoom(room, socket.id);
        }
        
        // إعادة اللاعب للردهة
        const player = this.players.get(socket.id);
        if (player) {
            player.status = 'available';
            this.lobbyPlayers.add(socket.id);
            socket.emit('lobbyJoined', { 
                playerName: player.name,
                leaderboard: this.getLeaderboard(),
                serverStats: this.getServerStats()
            });
        }
        
        this.broadcastLobbyUpdate();
    }

    // 🚀 تشغيل السيرفر
    start() {
        const PORT = process.env.PORT || 3000;
        const HOST = '0.0.0.0';

        this.server.listen(PORT, HOST, () => {
            console.log('🎮 خادم XO المحسن يعمل على PORT:', PORT);
            console.log('🌐 العنوان:', `http://localhost:${PORT}`);
            console.log('⏰ وقت البدء:', new Date().toLocaleString());
        });
    }
}

// تشغيل السيرفر
const gameServer = new XOGameServer();
gameServer.start();