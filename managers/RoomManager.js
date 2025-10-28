// ===============================================
// 🏠 مدير الغرف - إدارة غرف اللعبة
// ===============================================

class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.roomPlayers = new Map(); // playerId -> roomId
        this.pendingRooms = new Map();
        this.roomCleanupInterval = null;
        
        this.MAX_ROOM_AGE = parseInt(process.env.MAX_ROOM_AGE_MS) || 600000; // 10 دقائق
        this.MAX_INACTIVE_TIME = 300000; // 5 دقائق
        
        console.log('🏠 مدير الغرف - جاهز');
    }

    // 🏗️ إنشاء غرفة جديدة
    createRoom(player1, player2, gameType = 'classic') {
        const roomId = this.generateRoomId();
        
        const room = {
            id: roomId,
            players: [
                {
                    id: player1.id,
                    name: player1.name,
                    symbol: 'X',
                    socket: player1.socket,
                    ready: false,
                    joinedAt: Date.now(),
                    lastActivity: Date.now()
                },
                {
                    id: player2.id,
                    name: player2.name,
                    symbol: 'O',
                    socket: player2.socket,
                    ready: false,
                    joinedAt: Date.now(),
                    lastActivity: Date.now()
                }
            ],
            state: this.initializeGameState(),
            gameType: gameType,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            moves: 0,
            status: 'active',
            settings: {
                maxMoveTime: 30000,
                allowSpectators: true,
                isRanked: gameType === 'ranked'
            }
        };

        // حفظ الغرفة
        this.rooms.set(roomId, room);
        this.roomPlayers.set(player1.id, roomId);
        this.roomPlayers.set(player2.id, roomId);

        // انضمام اللاعبين للغرفة في Socket.IO
        player1.socket.join(roomId);
        player2.socket.join(roomId);

        console.log(`🆕 غرفة جديدة: ${roomId} - ${player1.name} vs ${player2.name}`);
        
        return room;
    }

    // 🎮 تهيئة حالة اللعبة
    initializeGameState() {
        return {
            board: Array(9).fill(null),
            currentPlayer: 'X',
            winner: null,
            isDraw: false,
            active: true,
            moves: 0,
            moveHistory: [],
            message: 'اللاعب X يبدأ',
            lastMoveTime: Date.now()
        };
    }

    // 🔍 البحث عن غرفة اللاعب
    getPlayerRoom(playerId) {
        const roomId = this.roomPlayers.get(playerId);
        return roomId ? this.rooms.get(roomId) : null;
    }

    getRoomById(roomId) {
        return this.rooms.get(roomId);
    }

    // 🎯 معالجة الحركة في الغرفة
    processMove(roomId, playerId, cellIndex) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('الغرفة غير موجودة');
        }

        const player = room.players.find(p => p.id === playerId);
        if (!player) {
            throw new Error('اللاعب ليس في هذه الغرفة');
        }

        this.validateMove(room, player, cellIndex);

        // تنفيذ الحركة
        room.state.board[cellIndex] = room.state.currentPlayer;
        room.state.moves++;
        room.state.moveHistory.push({
            player: player.symbol,
            cellIndex,
            timestamp: Date.now()
        });
        room.lastActivity = Date.now();
        player.lastActivity = Date.now();

        // التحقق من الفوز
        const winner = this.checkWinner(room.state.board);
        if (winner) {
            room.state.winner = winner;
            room.state.active = false;
            room.state.message = winner === 'draw' ? 'تعادل!' : `فاز ${winner}!`;
            room.completedAt = Date.now();
        } else {
            // تبديل اللاعب
            room.state.currentPlayer = room.state.currentPlayer === 'X' ? 'O' : 'X';
            room.state.message = `دور اللاعب ${room.state.currentPlayer}`;
            room.state.lastMoveTime = Date.now();
        }

        return room.state;
    }

    // 🛡️ التحقق من صحة الحركة
    validateMove(room, player, cellIndex) {
        if (!room.state.active) {
            throw new Error('اللعبة غير نشطة');
        }

        if (room.state.currentPlayer !== player.symbol) {
            throw new Error('ليس دورك للعب');
        }

        if (room.state.board[cellIndex] !== null) {
            throw new Error('الخلية مشغولة');
        }

        if (cellIndex < 0 || cellIndex > 8) {
            throw new Error('حركة غير صالحة');
        }

        // التحقق من وقت الحركة (إذا كان هناك وقت محدد)
        if (room.settings.maxMoveTime > 0) {
            const timeSinceLastMove = Date.now() - room.state.lastMoveTime;
            if (timeSinceLastMove > room.settings.maxMoveTime) {
                throw new Error('انتهى وقت الحركة');
            }
        }
    }

    // 🏆 التحقق من الفوز
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

        // التحقق من التعادل
        if (board.every(cell => cell !== null)) {
            return 'draw';
        }

        return null;
    }

    // 🔄 إعادة تشغيل اللعبة
    restartGame(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('الغرفة غير موجودة');
        }

        // تبديل الرموز
        room.players.forEach(player => {
            player.symbol = player.symbol === 'X' ? 'O' : 'X';
            player.ready = false;
        });

        // إعادة تهيئة حالة اللعبة
        room.state = this.initializeGameState();
        room.lastActivity = Date.now();
        room.moves = 0;

        console.log(`🔄 إعادة تشغيل الغرفة: ${roomId}`);
        
        return room;
    }

    // ✅ تحديد جاهزية اللاعب
    setPlayerReady(roomId, playerId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('الغرفة غير موجودة');
        }

        const player = room.players.find(p => p.id === playerId);
        if (player) {
            player.ready = true;
            player.lastActivity = Date.now();
        }

        // التحقق إذا كان كلا اللاعبين جاهزين
        const allReady = room.players.every(p => p.ready);
        if (allReady) {
            this.restartGame(roomId);
        }

        return { playerReady: player.ready, allPlayersReady: allReady };
    }

    // 🚪 مغادرة الغرفة
    leaveRoom(playerId) {
        const roomId = this.roomPlayers.get(playerId);
        if (!roomId) return null;

        const room = this.rooms.get(roomId);
        if (!room) return null;

        // إزالة اللاعب من الغرفة
        room.players = room.players.filter(p => p.id !== playerId);
        this.roomPlayers.delete(playerId);

        // إذا بقي لاعب واحد، إنهاء الغرفة
        if (room.players.length === 1) {
            const remainingPlayer = room.players[0];
            this.rooms.delete(roomId);
            this.roomPlayers.delete(remainingPlayer.id);
            
            console.log(`🚪 غرفة ${roomId} أغلقت - بقي لاعب واحد`);
            
            return {
                roomClosed: true,
                remainingPlayer: remainingPlayer.id
            };
        }

        // إذا لم يبقى أي لاعب، حذف الغرفة
        if (room.players.length === 0) {
            this.rooms.delete(roomId);
            console.log(`🗑️ غرفة ${roomId} حذفت - لا يوجد لاعبين`);
            
            return { roomClosed: true };
        }

        room.lastActivity = Date.now();
        return { roomClosed: false, remainingPlayers: room.players.length };
    }

    // 📊 إحصائيات الغرف
    getRoomStats() {
        const stats = {
            totalRooms: this.rooms.size,
            activeRooms: Array.from(this.rooms.values()).filter(room => room.status === 'active').length,
            completedRooms: Array.from(this.rooms.values()).filter(room => room.state.winner).length,
            totalPlayers: this.roomPlayers.size,
            roomsByGameType: {}
        };

        // إحصائيات حسب نوع اللعبة
        for (let room of this.rooms.values()) {
            stats.roomsByGameType[room.gameType] = (stats.roomsByGameType[room.gameType] || 0) + 1;
        }

        return stats;
    }

    // 🔍 البحث عن غرف
    findRooms(criteria = {}) {
        let rooms = Array.from(this.rooms.values());

        if (criteria.gameType) {
            rooms = rooms.filter(room => room.gameType === criteria.gameType);
        }

        if (criteria.status) {
            rooms = rooms.filter(room => room.status === criteria.status);
        }

        if (criteria.minPlayers) {
            rooms = rooms.filter(room => room.players.length >= criteria.minPlayers);
        }

        return rooms.sort((a, b) => b.createdAt - a.createdAt);
    }

    // 🧹 تنظيف الغرف القديمة
    cleanupOldRooms() {
        const now = Date.now();
        let cleanedCount = 0;

        for (let [roomId, room] of this.rooms) {
            // غرف منتهية لأكثر من ساعة
            if (room.completedAt && now - room.completedAt > 3600000) {
                this.deleteRoom(roomId);
                cleanedCount++;
                continue;
            }

            // غرف غير نشطة لأكثر من 10 دقائق
            if (now - room.lastActivity > this.MAX_ROOM_AGE) {
                this.deleteRoom(roomId);
                cleanedCount++;
                continue;
            }

            // لاعبين غير نشطين
            const inactivePlayers = room.players.filter(player => 
                now - player.lastActivity > this.MAX_INACTIVE_TIME
            );

            if (inactivePlayers.length > 0) {
                console.log(`🧹 تنظيف لاعبين غير نشطين من الغرفة ${roomId}`);
                this.handleInactivePlayers(room, inactivePlayers);
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 تم تنظيف ${cleanedCount} غرفة`);
        }
    }

    // 🚨 معالجة اللاعبين غير النشطين
    handleInactivePlayers(room, inactivePlayers) {
        for (let player of inactivePlayers) {
            this.leaveRoom(player.id);
            
            // إشعار اللاعبين النشطين
            const activePlayers = room.players.filter(p => !inactivePlayers.includes(p));
            for (let activePlayer of activePlayers) {
                activePlayer.socket.emit('playerInactive', {
                    playerName: player.name,
                    reason: 'نشاط منخفض'
                });
            }
        }
    }

    // 🗑️ حذف غرفة
    deleteRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // إزالة اللاعبين من الخريطة
        for (let player of room.players) {
            this.roomPlayers.delete(player.id);
        }

        // حذف الغرفة
        this.rooms.delete(roomId);
        
        console.log(`🗑️ تم حذف الغرفة: ${roomId}`);
    }

    // 🔧 أدوات مساعدة
    generateRoomId() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    getRoomCount() {
        return this.rooms.size;
    }

    getPlayerRoomId(playerId) {
        return this.roomPlayers.get(playerId);
    }

    isPlayerInRoom(playerId) {
        return this.roomPlayers.has(playerId);
    }

    // 🕒 بدء عملية التنظيف الدورية
    startCleanupProcess() {
        if (this.roomCleanupInterval) {
            clearInterval(this.roomCleanupInterval);
        }

        this.roomCleanupInterval = setInterval(() => {
            this.cleanupOldRooms();
        }, 60000); // كل دقيقة

        console.log('🧹 عملية تنظيف الغرف - مفعلة');
    }

    // ⏹️ إيقاف عملية التنظيف
    stopCleanupProcess() {
        if (this.roomCleanupInterval) {
            clearInterval(this.roomCleanupInterval);
            this.roomCleanupInterval = null;
        }
    }

    // 💾 استعادة غرفة (لإعادة الاتصال)
    restoreRoomForPlayer(playerId) {
        const roomId = this.roomPlayers.get(playerId);
        if (!roomId) return null;

        const room = this.rooms.get(roomId);
        if (!room) return null;

        const player = room.players.find(p => p.id === playerId);
        if (!player) return null;

        return {
            room,
            player,
            opponent: room.players.find(p => p.id !== playerId)
        };
    }
}

module.exports = RoomManager;