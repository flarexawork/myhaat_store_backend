const { Schema, model } = require('mongoose')

const pendingSignupSchema = new Schema(
    {
        challengeTokenHash: {
            type: String,
            required: true,
            unique: true,
            select: false
        },
        role: {
            type: String,
            enum: ['customer', 'seller'],
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true,
            index: true
        },
        mobile: {
            type: String,
            required: true,
            index: true
        },
        passwordHash: {
            type: String,
            required: true,
            select: false
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
        retryAvailableAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
)

pendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
pendingSignupSchema.index({ email: 1, role: 1, consumedAt: 1 })
pendingSignupSchema.index({ mobile: 1, role: 1, consumedAt: 1 })

module.exports = model('pending_signups', pendingSignupSchema)
