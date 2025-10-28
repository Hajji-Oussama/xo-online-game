// ===============================================
// 👤 مدير اللاعبين - إدارة اللاعبين والردهة
// ===============================================

class PlayerManager {
    constructor() {
        this.players = new Map();
        this.lobbyPlayers = new Set();
        this.playerInvites = new Map();
        this.playerActivity = new Map();
        
        console.log('👤 مدير اللاعبين - جاهز');
    }

    // 👤 إدارة دخول اللاعبين
    async handlePlayerJoin(socket, playerName) {
        // التحقق من الاسم
        if (!this.validatePlayerName(playerName)) {
            throw new Error('اسم اللاعب غير صالح');
        }

        // التحقق من التكرار
        if (this.isDuplicateName(playerName)) {
            throw new Error('الاسم مستخدم بالفعل');
        }

        // إنشاء لاعب جديد
        const player = {
            id: socket.id,
            name: playerName.trim(),
            socket: socket,
            status: 'available',
            joinedAt: Date.now(),
            lastActivity: Date.now(),
            rating: 1000,
            invitesSent: new Set(),
            invitesReceived: new Set()
        };

        // حفظ اللاعب
        this.players.set(socket.id, player);
        this.lobbyPlayers.add(socket.id);
        this.updatePlayerActivity(socket.id);

        console.log(`👤 ${playerName} انضم للردهة`);
        return player;
    }

    // 📨 إدارة الدعوات
    async handleSendInvite(senderId, targetId) {
        const sender = this.players.get(senderId);
        const target = this.players.get(targetId);

        if (!sender || !target) {
            throw new Error('اللاعب غير موجود');
        }

        if (sender.status !== 'available' || target.status !== 'available') {
            throw new Error('اللاعب غير متاح');
        }

        if (this.hasPendingInvite(senderId, targetId)) {
            throw new Error('لديك دعوة pending لهذا اللاعب');
        }

        // إنشاء دعوة
        const invite = {
            id: this.generateInviteId(),
            senderId,
            targetId,
            senderName: sender.name,
            timestamp: Date.now(),
            status: 'pending'
        };

        // حفظ الدعوة
        this.playerInvites.set(invite.id, invite);
        sender.invitesSent.add(invite.id);
        target.invitesReceived.add(invite.id);

        // إرسال الدعوة للهدف
        target.socket.emit('inviteReceived', {
            inviterId: senderId,
            inviterName: sender.name,
            inviteId: invite.id
        });

        console.log(`📨 ${sender.name} أرسل دعوة لـ ${target.name}`);
        
        return { targetName: target.name, inviteId: invite.id };
    }

    async handleAcceptInvite(playerId, inviteId) {
        const invite = this.playerInvites.get(inviteId);
        if (!invite || invite.targetId !== playerId) {
            throw new Error('الدعوة غير موجودة');
        }

        const sender = this.players.get(invite.senderId);
        const acceptor = this.players.get(playerId);

        if (!sender || !acceptor) {
            throw new Error('اللاعب غير موجود');
        }

        // تحديث حالة الدعوة
        invite.status = 'accepted';
        
        // تحديث حالة اللاعبين
        sender.status = 'in_game';
        acceptor.status = 'in_game';

        // تنظيف الدعوات
        this.cleanupPlayerInvites(sender.id);
        this.cleanupPlayerInvites(acceptor.id);

        console.log(`✅ ${acceptor.name} قبل دعوة ${sender.name}`);
        
        return { sender, acceptor };
    }

    async handleDeclineInvite(playerId, inviteId) {
        const invite = this.playerInvites.get(inviteId);
        if (!invite || invite.targetId !== playerId) {
            throw new Error('الدعوة غير موجودة');
        }

        const sender = this.players.get(invite.senderId);
        
        // إشعار المرسل
        sender.socket.emit('inviteDeclined', {
            targetName: this.players.get(playerId).name
        });

        // حذف الدعوة
        this.playerInvites.delete(inviteId);

        console.log(`❌ ${this.players.get(playerId).name} رفض دعوة ${sender.name}`);
    }

    // 🚪 إدارة مغادرة اللاعبين
    async handlePlayerLeave(playerId, reason = 'غادر اللاعب') {
        const player = this.players.get(playerId);
        if (!player) return;

        console.log(`🚪 ${player.name} غادر - السبب: ${reason}`);

        // تنظيف الدعوات
        this.cleanupPlayerInvites(playerId);

        // إزالة من الردهة
        this.lobbyPlayers.delete(playerId);

        // إزالة من اللاعبين
        this.players.delete(playerId);
        this.playerActivity.delete(playerId);

        // إشعار اللاعبين في الردهة
        this.notifyLobbyPlayers();
    }

    // 🔄 إعادة الاتصال
    async handlePlayerReconnect(socket, playerId) {
        const player = this.players.get(playerId);
        if (!player) {
            throw new Error('جلسة اللاعب منتهية');
        }

        // تحديث السوكت
        player.socket = socket;
        player.status = 'available';
        player.lastActivity = Date.now();

        this.lobbyPlayers.add(playerId);
        this.updatePlayerActivity(playerId);

        console.log(`🔁 ${player.name} أعاد الاتصال`);
        
        return player;
    }

    // 📊 الحصول على بيانات اللاعبين
    getLobbyPlayers() {
        return Array.from(this.lobbyPlayers)
            .map(playerId => {
                const player = this.players.get(playerId);
                if (!player) return null;
                
                return {
                    id: player.id,
                    name: player.name,
                    status: player.status,
                    rating: player.rating,
                    lastActivity: player.lastActivity
                };
            })
            .filter(player => player !== null)
            .sort((a, b) => b.rating - a.rating);
    }

    getPlayerCount() {
        return this.players.size;
    }

    getPlayer(playerId) {
        return this.players.get(playerId);
    }

    // 🧹 تنظيف الذاكرة
    cleanupInactivePlayers() {
        const now = Date.now();
        const INACTIVE_THRESHOLD = 300000; // 5 دقائق

        for (let [playerId, player] of this.players) {
            if (now - player.lastActivity > INACTIVE_THRESHOLD) {
                console.log(`🧹 تنظيف لاعب غير نشط: ${player.name}`);
                this.handlePlayerLeave(playerId, 'نشاط منخفض');
            }
        }
    }

    cleanupPlayerInvites(playerId) {
        const player = this.players.get(playerId);
        if (!player) return;

        // تنظيف الدعوات المرسلة
        for (let inviteId of player.invitesSent) {
            const invite = this.playerInvites.get(inviteId);
            if (invite && invite.status === 'pending') {
                this.playerInvites.delete(inviteId);
            }
        }

        // تنظيف الدعوات المستلمة
        for (let inviteId of player.invitesReceived) {
            const invite = this.playerInvites.get(inviteId);
            if (invite && invite.status === 'pending') {
                this.playerInvites.delete(inviteId);
            }
        }

        player.invitesSent.clear();
        player.invitesReceived.clear();
    }

    // 🛡️ أدوات التحقق
    validatePlayerName(name) {
        if (typeof name !== 'string') return false;
        if (name.length < 2 || name.length > 20) return false;
        
        // منع أحخاص خاصة
        const forbiddenChars = /[<>'"&;{}()\[\]]/;
        if (forbiddenChars.test(name)) return false;
        
        // التحقق من الأحرف المسموحة
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

    // 🔧 أدوات مساعدة
    updatePlayerActivity(playerId) {
        this.playerActivity.set(playerId, Date.now());
        const player = this.players.get(playerId);
        if (player) {
            player.lastActivity = Date.now();
        }
    }

    generateInviteId() {
        return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    notifyLobbyPlayers() {
        const lobbyData = this.getLobbyPlayers();
        
        // إرسال تحديث لجميع اللاعبين في الردهة
        for (let playerId of this.lobbyPlayers) {
            const player = this.players.get(playerId);
            if (player && player.socket) {
                player.socket.emit('lobbyUpdated', {
                    players: lobbyData,
                    timestamp: Date.now()
                });
            }
        }
    }

    // 🎯 تحديث التصنيف
    updatePlayerRating(playerId, change) {
        const player = this.players.get(playerId);
        if (player) {
            player.rating = Math.max(800, player.rating + change);
        }
    }
}

module.exports = PlayerManager;