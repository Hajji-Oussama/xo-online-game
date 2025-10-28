// ===============================================
// 🛡️ مدير الأمان - الحماية الشاملة
// ===============================================

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

class SecurityManager {
    constructor() {
        this.suspiciousIPs = new Map();
        this.failedAttempts = new Map();
        this.BAN_DURATION = 15 * 60 * 1000; // 15 دقيقة
        this.MAX_FAILED_ATTEMPTS = 5;
        
        console.log('🛡️  مدير الأمان - جاهز');
    }

    setupSecurityMiddleware(app) {
        // 🔒 حماية الرأسيات
        app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    connectSrc: ["'self'", "ws:", "wss:"],
                    imgSrc: ["'self'", "data:", "https:"]
                }
            },
            crossOriginEmbedderPolicy: false
        }));

        // 🚫 معدل الطلبات العام
        app.use(rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 100,
            message: { error: 'تم تجاوز الحد المسموح من الطلبات' }
        }));

        // 📝 تحقق من حجم البيانات
        app.use(express.json({ limit: '10kb' }));
        app.use(express.urlencoded({ extended: true, limit: '10kb' }));
    }

    setupSocketSecurity(io) {
        io.use(async (socket, next) => {
            try {
                const ip = socket.handshake.address;
                
                // 🚫 تحقق من IP المحظور
                if (await this.isIPBanned(ip)) {
                    return next(new Error('عنوان IP محظور مؤقتاً'));
                }

                // 📊 تحقق من معدل الطلبات
                if (!await this.checkSocketRateLimit(ip)) {
                    return next(new Error('معدل الطلبات مرتفع جداً'));
                }

                // 🔍 تحقق من البيانات الأساسية
                const validationError = this.validateHandshake(socket.handshake);
                if (validationError) {
                    await this.recordFailedAttempt(ip);
                    return next(new Error(validationError));
                }

                next();
            } catch (error) {
                next(new Error('فشل التحقق الأمني'));
            }
        });
    }

    async validateRequest(socket, action, data) {
        const ip = socket.handshake.address;
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
        const schemas = {
            joinLobby: Joi.object({
                playerName: Joi.string().min(2).max(20).pattern(/^[\p{L}\p{N}\s_-]+$/u).required()
            }),

            makeMove: Joi.object({
                cellIndex: Joi.number().integer().min(0).max(8).required(),
                roomId: Joi.string().length(8).required(),
                timestamp: Joi.number().integer().min(Date.now() - 5000).max(Date.now() + 1000)
            }),

            sendInvite: Joi.object({
                targetId: Joi.string().length(20).required()
            })
        };

        const schema = schemas[action];
        if (!schema) return null;

        const { error } = schema.validate(data);
        return error ? error.details[0].message : null;
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

        // تحقق من User-Agent
        const userAgent = handshake.headers['user-agent'];
        if (!userAgent || userAgent.length < 10) {
            return 'User-Agent غير صالح';
        }

        return null;
    }

    // 🆕 تنظيف البيانات القديمة
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