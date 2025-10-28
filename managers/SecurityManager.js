// ===============================================
// 🛡️ مدير الأمان - الحماية الشاملة (مصحح)
// ===============================================

class SecurityManager {
    constructor() {
        this.suspiciousIPs = new Map();
        this.failedAttempts = new Map();
        this.BAN_DURATION = 15 * 60 * 1000; // 15 دقيقة
        this.MAX_FAILED_ATTEMPTS = 5;
        
        console.log('🛡️  مدير الأمان - جاهز');
    }

    setupSecurityMiddleware(app) {
        // 🔒 إعدادات أمان مبسطة - سيتم التعامل مع express في server.js
        console.log('🔒 إعدادات الأمان - مفعلة (مبسطة)');
        // تم نقل express.json() إلى server.js مباشرة
    }

    setupSocketSecurity(io) {
        io.use(async (socket, next) => {
            try {
                const ip = this.getClientIP(socket);
                
                // 🚫 تحقق من IP المحظور
                if (await this.isIPBanned(ip)) {
                    return next(new Error('عنوان IP محظور مؤقتاً'));
                }

                // 📊 تحقق من معدل الطلبات
                if (!await this.checkSocketRateLimit(ip)) {
                    return next(new Error('معدل الطلبات مرتفع جداً'));
                }

                next();
            } catch (error) {
                next(new Error('فشل التحقق الأمني'));
            }
        });
    }

    async validateRequest(socket, action, data) {
        const ip = this.getClientIP(socket);
        const playerId = socket.id;

        // 🚫 تحقق من الحظر
        if (await this.isIPBanned(ip)) {
            throw new Error('عنوان IP محظور');
        }

        // 📊 تحقق من معدل الطلبات
        if (!await this.checkActionRateLimit(playerId, action)) {
            throw new Error('معدل الطلبات مرتفع');
        }

        // 🔍 تحقق من صحة البيانات
        const validationError = this.validateActionData(action, data);
        if (validationError) {
            await this.recordFailedAttempt(ip);
            throw new Error(validationError);
        }

        return true;
    }

    validateActionData(action, data) {
        const validators = {
            joinLobby: (data) => this.validateJoinLobbyData(data),
            makeMove: (data) => this.validateMoveData(data),
            sendInvite: (data) => this.validateInviteData(data)
        };

        const validator = validators[action];
        if (!validator) return null;

        return validator(data);
    }

    validateJoinLobbyData(data) {
        if (!data || typeof data !== 'object') {
            return 'بيانات غير صالحة';
        }

        const { playerName } = data;

        if (!playerName || typeof playerName !== 'string') {
            return 'اسم اللاعب مطلوب';
        }

        if (playerName.length < 2 || playerName.length > 20) {
            return 'الاسم يجب أن يكون بين 2 و 20 حرف';
        }

        // تحقق من الأحرف المسموحة
        const validPattern = /^[\p{L}\p{N}\s_-]+$/u;
        if (!validPattern.test(playerName)) {
            return 'الاسم يمكن أن يحتوي على أحرف وأرقام ومسافات فقط';
        }

        return null;
    }

    validateMoveData(data) {
        if (!data || typeof data !== 'object') {
            return 'بيانات غير صالحة';
        }

        const { cellIndex, roomId, timestamp } = data;

        if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 8) {
            return 'رقم الخلية يجب أن يكون بين 0 و 8';
        }

        if (!roomId || typeof roomId !== 'string' || roomId.length !== 8) {
            return 'معرف الغرفة غير صالح';
        }

        if (typeof timestamp !== 'number') {
            return 'الطابع الزمني غير صالح';
        }

        const now = Date.now();
        if (timestamp < now - 5000 || timestamp > now + 1000) {
            return 'الطابع الزمني غير صالح';
        }

        return null;
    }

    validateInviteData(data) {
        if (!data || typeof data !== 'object') {
            return 'بيانات غير صالحة';
        }

        const { targetId } = data;

        if (!targetId || typeof targetId !== 'string' || targetId.length !== 20) {
            return 'معرف الهدف غير صالح';
        }

        return null;
    }

    async checkActionRateLimit(playerId, action) {
        const key = `${playerId}:${action}`;
        const now = Date.now();
        const windowMs = this.getActionWindow(action);
        
        const attempts = this.failedAttempts.get(key) || [];
        const recentAttempts = attempts.filter(time => time > now - windowMs);

        if (recentAttempts.length >= this.getActionLimit(action)) {
            return false;
        }

        recentAttempts.push(now);
        this.failedAttempts.set(key, recentAttempts);
        return true;
    }

    async checkSocketRateLimit(ip) {
        const key = `socket:${ip}`;
        const now = Date.now();
        const windowMs = 60000; // 1 دقيقة
        
        const attempts = this.failedAttempts.get(key) || [];
        const recentAttempts = attempts.filter(time => time > now - windowMs);

        if (recentAttempts.length >= 10) { // 10 محاولات في الدقيقة
            return false;
        }

        recentAttempts.push(now);
        this.failedAttempts.set(key, recentAttempts);
        return true;
    }

    getActionWindow(action) {
        const windows = {
            joinLobby: 60000,    // 1 دقيقة
            makeMove: 1000,      // 1 ثانية
            sendInvite: 30000    // 30 ثانية
        };
        return windows[action] || 60000;
    }

    getActionLimit(action) {
        const limits = {
            joinLobby: 3,    // 3 محاولات في الدقيقة
            makeMove: 10,    // 10 حركات في الثانية
            sendInvite: 5    // 5 دعوات في 30 ثانية
        };
        return limits[action] || 5;
    }

    async recordFailedAttempt(ip) {
        const attempts = this.failedAttempts.get(ip) || [];
        attempts.push(Date.now());
        this.failedAttempts.set(ip, attempts);

        // إذا تجاوز الحد، احظر IP
        if (attempts.length >= this.MAX_FAILED_ATTEMPTS) {
            await this.banIP(ip, this.BAN_DURATION);
        }
    }

    async banIP(ip, duration) {
        this.suspiciousIPs.set(ip, Date.now() + duration);
        console.log(`🚫 IP محظور: ${ip} لمدة ${duration / 1000} ثانية`);

        // إزالة الحظر بعد المدة
        setTimeout(() => {
            this.suspiciousIPs.delete(ip);
            console.log(`✅ IP مرفوع الحظر: ${ip}`);
        }, duration);
    }

    async isIPBanned(ip) {
        const banTime = this.suspiciousIPs.get(ip);
        if (banTime && Date.now() < banTime) {
            return true;
        }
        
        if (banTime) {
            this.suspiciousIPs.delete(ip);
        }
        
        return false;
    }

    validateHandshake(handshake) {
        // تحقق من Origin
        const origin = handshake.headers.origin;
        const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
            process.env.ALLOWED_ORIGINS.split(',') : ['*'];

        if (!allowedOrigins.includes('*') && !allowedOrigins.includes(origin)) {
            return 'مصدر غير مسموح';
        }

        return null;
    }

    getClientIP(socket) {
        return socket.handshake.headers['x-forwarded-for'] || 
               socket.handshake.address ||
               socket.request.connection.remoteAddress;
    }

    // 🧹 تنظيف البيانات القديمة
    cleanupOldData() {
        const now = Date.now();
        
        // تنظيف IPs المحظورة
        for (let [ip, banTime] of this.suspiciousIPs) {
            if (now > banTime) {
                this.suspiciousIPs.delete(ip);
            }
        }

        // تنظيف محاولات الفشل
        for (let [key, attempts] of this.failedAttempts) {
            const cleanAttempts = attempts.filter(time => now - time < 3600000); // ساعة واحدة
            if (cleanAttempts.length === 0) {
                this.failedAttempts.delete(key);
            } else {
                this.failedAttempts.set(key, cleanAttempts);
            }
        }
    }
}

module.exports = SecurityManager;