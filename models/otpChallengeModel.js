const { Schema, model } = require('mongoose')

const otpChallengeSchema = new Schema(
    {
        challengeTokenHash: {
            type: String,
            required: true,
            unique: true,
            select: false
        },
        accountId: {
            type: Schema.Types.ObjectId,
            required: true,
            index: true
        },
        role: {
            type: String,
            enum: ['customer', 'seller', 'admin'],
            required: true,
            index: true
        },
        purpose: {
            type: String,
            enum: ['login', 'signup', 'forgot_password'],
            required: true,
            index: true
        },
        reqId: {
            type: String,
            required: true
        },
        maskedIdentifier: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Date,
            required: true,
            index: true
        },
        consumedAt: {
            type: Date,
            default: null
        },
        attempts: {
            type: Number,
            default: 0
        },
        retries: {
            type: Number,
            default: 0
        },
        retryAvailableAt: {
            type: Date,
            default: null
        },
        lastAttemptAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
)

otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
otpChallengeSchema.index({ accountId: 1, role: 1, purpose: 1, consumedAt: 1 })

module.exports = model('otp_challenges', otpChallengeSchema)
