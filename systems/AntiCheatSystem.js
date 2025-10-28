// ===============================================
// 🛡️ نظام منع الغش - الحماية من التلاعب
// ===============================================

class AntiCheatSystem {
    constructor() {
        this.playerMovements = new Map();
        this.suspiciousActivities = new Map();
        this.flaggedPlayers = new Set();
        
        this.MOVE_COOLDOWN = parseInt(process.env.MOVE_COOLDOWN_MS) || 400;
        this.MAX_MOVES_PER_MINUTE = 60;
        this.SUSPICIOUS_THRESHOLD = 5;
        
        console.log('🛡️  نظام منع الغش - جاهز');
    }

    // 🎯 التحقق من صحة الحركة
    async validateMove(playerId, cellIndex) {
        const playerData = this.getPlayerData(playerId);
        const now = Date.now();

        // 1. التحقق من التبريد
        if (!this.checkMoveCooldown(playerData, now)) {
            throw new Error('الحركة سريعة جداً');
        }

        // 2. التحقق من معدل الحركات
        if (!this.checkMoveRate(playerData, now)) {
            throw new Error('معدل الحركات مرتفع جداً');
        }

        // 3. التحقق من نمط الحركات
        if (this.detectSuspiciousPattern(playerData, cellIndex)) {
            this.flagPlayer(playerId, 'نمط حركات مشبوه');
            throw new Error('نمط حركات غير طبيعي');
        }

        // 4. تسجيل الحركة
        this.recordMove(playerData, cellIndex, now);

        return true;
    }

    // 📊 جمع بيانات اللاعب
    getPlayerData(playerId) {
        if (!this.playerMovements.has(playerId)) {
            this.playerMovements.set(playerId, {
                moves: [],
                moveTimes: [],
                lastMoveTime: 0,
                moveCount: 0,
                patterns: [],
                riskScore: 0
            });
        }
        return this.playerMovements.get(playerId);
    }

    // ⏱️ التحقق من التبريد
    checkMoveCooldown(playerData, currentTime) {
        if (playerData.lastMoveTime === 0) return true;
        
        const timeSinceLastMove = currentTime - playerData.lastMoveTime;
        return timeSinceLastMove >= this.MOVE_COOLDOWN;
    }

    // 📈 التحقق من معدل الحركات
    checkMoveRate(playerData, currentTime) {
        const oneMinuteAgo = currentTime - 60000;
        const recentMoves = playerData.moveTimes.filter(time => time > oneMinuteAgo);
        
        return recentMoves.length < this.MAX_MOVES_PER_MINUTE;
    }

    // 🔍 اكتشاف الأنماط المشبوهة
    detectSuspiciousPattern(playerData, cellIndex) {
        const recentMoves = playerData.moves.slice(-10); // آخر 10 حركات
        
        // 1. تحقق من الحركات المتطابقة
        if (this.checkRepeatingMoves(recentMoves, cellIndex)) {
            return true;
        }

        // 2. تحقق من التسلسل الرياضي
        if (this.checkMathematicalSequence(recentMoves, cellIndex)) {
            return true;
        }

        // 3. تحقق من التوقيت الدقيق
        if (this.checkExactTiming(playerData)) {
            return true;
        }

        return false;
    }

    // 🔁 الحركات المتكررة
    checkRepeatingMoves(recentMoves, currentMove) {
        if (recentMoves.length < 3) return false;
        
        // إذا كانت الحركة الجديدة تكرر نمطاً معيناً
        const lastThree = recentMoves.slice(-3);
        const pattern = lastThree.join(',');
        
        // تحقق إذا كان النمط يتكرر
        const patternCount = recentMoves.join(',').split(pattern).length - 1;
        return patternCount > 2;
    }

    // 🧮 التسلسل الرياضي
    checkMathematicalSequence(recentMoves, currentMove) {
        if (recentMoves.length < 4) return false;
        
        const moves = [...recentMoves, currentMove];
        
        // تحقق من التسلسل الحسابي
        const differences = [];
        for (let i = 1; i < moves.length; i++) {
            differences.push(moves[i] - moves[i - 1]);
        }
        
        // إذا كانت جميع الفروق متساوية (تسلسل حسابي)
        const allEqual = differences.every(diff => diff === differences[0]);
        if (allEqual && Math.abs(differences[0]) > 0) {
            return true;
        }

        // تحقق من التسلسل الهندسي
        const ratios = [];
        for (let i = 1; i < moves.length; i++) {
            if (moves[i - 1] !== 0) {
                ratios.push(moves[i] / moves[i - 1]);
            }
        }
        
        const allRatiosEqual = ratios.length > 2 && ratios.every(ratio => ratio === ratios[0]);
        return allRatiosEqual;
    }

    // ⏰ التوقيت الدقيق
    checkExactTiming(playerData) {
        if (playerData.moveTimes.length < 5) return false;
        
        const recentTimes = playerData.moveTimes.slice(-5);
        const differences = [];
        
        for (let i = 1; i < recentTimes.length; i++) {
            differences.push(recentTimes[i] - recentTimes[i - 1]);
        }
        
        // إذا كانت جميع الفروق الزمنية متطابقة تماماً
        const firstDiff = differences[0];
        const allExact = differences.every(diff => Math.abs(diff - firstDiff) < 10);
        
        return allExact;
    }

    // 📝 تسجيل الحركة
    recordMove(playerData, cellIndex, timestamp) {
        playerData.moves.push(cellIndex);
        playerData.moveTimes.push(timestamp);
        playerData.lastMoveTime = timestamp;
        playerData.moveCount++;
        
        // الحفاظ على حجم البيانات
        if (playerData.moves.length > 50) {
            playerData.moves = playerData.moves.slice(-25);
            playerData.moveTimes = playerData.moveTimes.slice(-25);
        }
    }

    // 🚨 تصنيف اللاعب
    flagPlayer(playerId, reason) {
        this.flaggedPlayers.add(playerId);
        
        if (!this.suspiciousActivities.has(playerId)) {
            this.suspiciousActivities.set(playerId, []);
        }
        
        this.suspiciousActivities.get(playerId).push({
            reason,
            timestamp: Date.now(),
            moves: this.playerMovements.get(playerId)?.moves.slice(-10) || []
        });
        
        console.log(`🚨 لاعب مصنف: ${playerId} - السبب: ${reason}`);
        
        // 🆕 إشعار المشرفين
        this.notifyAdmins(playerId, reason);
    }

    // 📧 إشعار المشرفين
    notifyAdmins(playerId, reason) {
        // يمكن إرسال بريد إلكتروني أو إشعار في نظام المراقبة
        const alert = {
            type: 'CHEAT_DETECTED',
            playerId,
            reason,
            timestamp: new Date().toISOString(),
            severity: 'HIGH'
        };
        
        console.log('🚨 تنبيه غش:', alert);
        
        // 🆕 دمج مع نظام المراقبة
        if (global.monitoringSystem) {
            global.monitoringSystem.logSuspiciousActivity(playerId, 'cheating', reason);
        }
    }

    // 📊 تحليل المخاطر
    calculateRiskScore(playerId) {
        const playerData = this.playerMovements.get(playerId);
        if (!playerData) return 0;
        
        let score = 0;
        
        // زيادة النقاط بناء على الأنماط المشبوهة
        if (this.detectSuspiciousPattern(playerData, -1)) {
            score += 30;
        }
        
        // زيادة النقاط بناء على معدل الحركات
        const moveRate = playerData.moveTimes.filter(time => 
            Date.now() - time < 60000
        ).length;
        
        if (moveRate > this.MAX_MOVES_PER_MINUTE * 0.8) {
            score += 20;
        }
        
        // زيادة النقاط بناء على التبريد
        const recentMoves = playerData.moveTimes.slice(-5);
        if (recentMoves.length >= 2) {
            const avgCooldown = recentMoves[recentMoves.length - 1] - recentMoves[0];
            if (avgCooldown < this.MOVE_COOLDOWN * 5) {
                score += 15;
            }
        }
        
        playerData.riskScore = score;
        return score;
    }

    // 🧹 تنظيف البيانات
    cleanupOldData() {
        const oneHourAgo = Date.now() - 3600000;
        
        // تنظيف بيانات الحركات القديمة
        for (let [playerId, playerData] of this.playerMovements) {
            playerData.moveTimes = playerData.moveTimes.filter(time => time > oneHourAgo);
            if (playerData.moveTimes.length === 0) {
                this.playerMovements.delete(playerId);
            }
        }
        
        // تنظيف التصنيفات القديمة
        for (let playerId of this.flaggedPlayers) {
            const activities = this.suspiciousActivities.get(playerId);
            if (activities) {
                const recentActivities = activities.filter(activity => 
                    activity.timestamp > oneHourAgo
                );
                
                if (recentActivities.length === 0) {
                    this.flaggedPlayers.delete(playerId);
                    this.suspiciousActivities.delete(playerId);
                }
            }
        }
    }

    // 📈 تقارير النظام
    getSystemReport() {
        return {
            monitoredPlayers: this.playerMovements.size,
            flaggedPlayers: this.flaggedPlayers.size,
            suspiciousActivities: Array.from(this.suspiciousActivities.entries()).length,
            moveCooldown: this.MOVE_COOLDOWN,
            maxMovesPerMinute: this.MAX_MOVES_PER_MINUTE
        };
    }

    // 🔍 فحص لاعب محدد
    inspectPlayer(playerId) {
        const playerData = this.playerMovements.get(playerId);
        const activities = this.suspiciousActivities.get(playerId);
        
        return {
            playerId,
            riskScore: this.calculateRiskScore(playerId),
            isFlagged: this.flaggedPlayers.has(playerId),
            moveCount: playerData?.moveCount || 0,
            recentMoves: playerData?.moves.slice(-10) || [],
            suspiciousActivities: activities || [],
            moveRate: playerData ? playerData.moveTimes.filter(time => 
                Date.now() - time < 60000
            ).length : 0
        };
    }
}

module.exports = AntiCheatSystem;