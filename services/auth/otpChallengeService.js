const crypto = require('crypto')
const OtpChallenge = require('../../models/otpChallengeModel')
const PendingSignup = require('../../models/pendingSignupModel')
const msg91OtpService = require('./msg91OtpService')

const LOGIN_PURPOSE = 'login'
const SIGNUP_PURPOSE = 'signup'
const DEFAULT_COUNTRY_CODE = '91'
const DEFAULT_EXPIRY_MINUTES = 5
const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_RESEND_COOLDOWN_SECONDS = 30

class OtpChallengeError extends Error {
    constructor(message, statusCode = 400, code = 'OTP_CHALLENGE_ERROR') {
        super(message)
        this.name = 'OtpChallengeError'
        this.statusCode = statusCode
        this.code = code
    }
}

const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex')

const getPositiveEnvNumber = (key, fallback) => {
    const value = Number(process.env[key])
    return Number.isFinite(value) && value > 0 ? value : fallback
}

const getChallengeExpiryMinutes = () => getPositiveEnvNumber(
    'MSG91_OTP_CHALLENGE_EXPIRY_MINUTES',
    DEFAULT_EXPIRY_MINUTES
)

const getMaxAttempts = () => getPositiveEnvNumber(
    'MSG91_OTP_MAX_ATTEMPTS',
    DEFAULT_MAX_ATTEMPTS
)

const getResendCooldownSeconds = () => getPositiveEnvNumber(
    'MSG91_OTP_RESEND_COOLDOWN_SECONDS',
    DEFAULT_RESEND_COOLDOWN_SECONDS
)

const getDefaultCountryCode = () => {
    return (process.env.MSG91_DEFAULT_COUNTRY_CODE || DEFAULT_COUNTRY_CODE)
        .toString()
        .replace(/\D/g, '') || DEFAULT_COUNTRY_CODE
}

const normalizeOtpIdentifier = (identifier = '') => {
    const trimmed = identifier.toString().trim()

    if (!trimmed) {
        return ''
    }

    if (trimmed.includes('@')) {
        return trimmed.toLowerCase()
    }

    const digits = trimmed.replace(/\D/g, '')
    if (!digits) {
        return trimmed
    }

    if (digits.length === 10) {
        return `${getDefaultCountryCode()}${digits}`
    }

    return digits
}

const maskIdentifier = (identifier = '') => {
    if (identifier.includes('@')) {
        const [name = '', domain = ''] = identifier.split('@')
        const visibleName = name.slice(0, 2)
        return `${visibleName}${'*'.repeat(Math.max(name.length - 2, 3))}@${domain}`
    }

    const digits = identifier.replace(/\D/g, '')
    if (digits.length <= 4) {
        return '****'
    }

    return `${'*'.repeat(Math.max(digits.length - 4, 4))}${digits.slice(-4)}`
}

const getSafeError = () => new OtpChallengeError(
    'We could not send the OTP. Please try again later.',
    503,
    'OTP_SEND_FAILED'
)

const createLoginChallenge = async ({ accountId, role, identifier }) => {
    const normalizedIdentifier = normalizeOtpIdentifier(identifier)

    if (!accountId || !role || !normalizedIdentifier) {
        throw new OtpChallengeError('OTP challenge details are incomplete.', 400, 'OTP_INPUT_REQUIRED')
    }

    let providerResponse
    try {
        providerResponse = await msg91OtpService.sendOtp(normalizedIdentifier)
    } catch (error) {
        throw getSafeError()
    }

    const challengeToken = crypto.randomBytes(32).toString('hex')
    const cooldownSeconds = getResendCooldownSeconds()

    await OtpChallenge.updateMany(
        {
            accountId,
            role,
            purpose: LOGIN_PURPOSE,
            consumedAt: null
        },
        { $set: { consumedAt: new Date() } }
    )

    await OtpChallenge.create({
        challengeTokenHash: hashToken(challengeToken),
        accountId,
        role,
        purpose: LOGIN_PURPOSE,
        reqId: providerResponse.reqId,
        maskedIdentifier: maskIdentifier(normalizedIdentifier),
        expiresAt: new Date(Date.now() + getChallengeExpiryMinutes() * 60 * 1000),
        retryAvailableAt: new Date(Date.now() + cooldownSeconds * 1000)
    })

    return {
        challengeToken,
        maskedIdentifier: maskIdentifier(normalizedIdentifier),
        expiresInSeconds: getChallengeExpiryMinutes() * 60,
        resendCooldownSeconds: cooldownSeconds
    }
}

const createSignupChallenge = async ({ role, name, email, mobile, passwordHash }) => {
    const normalizedIdentifier = normalizeOtpIdentifier(mobile)

    if (!role || !name || !email || !mobile || !passwordHash || !normalizedIdentifier) {
        throw new OtpChallengeError('Signup OTP details are incomplete.', 400, 'SIGNUP_OTP_INPUT_REQUIRED')
    }

    let providerResponse
    try {
        providerResponse = await msg91OtpService.sendOtp(normalizedIdentifier)
    } catch (error) {
        throw getSafeError()
    }

    const challengeToken = crypto.randomBytes(32).toString('hex')
    const cooldownSeconds = getResendCooldownSeconds()

    await PendingSignup.updateMany(
        {
            email,
            role,
            consumedAt: null
        },
        { $set: { consumedAt: new Date() } }
    )

    await PendingSignup.create({
        challengeTokenHash: hashToken(challengeToken),
        role,
        name,
        email,
        mobile,
        passwordHash,
        reqId: providerResponse.reqId,
        maskedIdentifier: maskIdentifier(normalizedIdentifier),
        expiresAt: new Date(Date.now() + getChallengeExpiryMinutes() * 60 * 1000),
        retryAvailableAt: new Date(Date.now() + cooldownSeconds * 1000)
    })

    return {
        challengeToken,
        maskedIdentifier: maskIdentifier(normalizedIdentifier),
        expiresInSeconds: getChallengeExpiryMinutes() * 60,
        resendCooldownSeconds: cooldownSeconds
    }
}

const findActiveSignup = async ({ challengeToken, role }) => {
    if (!challengeToken) {
        throw new OtpChallengeError('Signup OTP challenge token is required.', 400, 'SIGNUP_OTP_CHALLENGE_REQUIRED')
    }

    const pendingSignup = await PendingSignup
        .findOne({
            challengeTokenHash: hashToken(challengeToken),
            role,
            consumedAt: null,
            expiresAt: { $gt: new Date() }
        })
        .select('+challengeTokenHash +passwordHash')

    if (!pendingSignup) {
        throw new OtpChallengeError('This signup OTP challenge is invalid or expired.', 400, 'SIGNUP_OTP_CHALLENGE_INVALID')
    }

    return pendingSignup
}

const verifySignupChallenge = async ({ challengeToken, role, otp }) => {
    if (!otp) {
        throw new OtpChallengeError('OTP is required.', 400, 'OTP_REQUIRED')
    }

    const pendingSignup = await findActiveSignup({ challengeToken, role })

    if (pendingSignup.attempts >= getMaxAttempts()) {
        pendingSignup.consumedAt = new Date()
        await pendingSignup.save()
        throw new OtpChallengeError('Too many OTP attempts. Please sign up again.', 429, 'OTP_MAX_ATTEMPTS')
    }

    pendingSignup.attempts += 1
    await pendingSignup.save()

    try {
        const verification = await msg91OtpService.verifyOtp(pendingSignup.reqId, otp)
        if (verification.accessToken) {
            await msg91OtpService.verifyAccessToken(verification.accessToken)
        }
    } catch (error) {
        throw new OtpChallengeError('The OTP you entered is invalid or expired.', 400, 'OTP_VERIFY_FAILED')
    }

    const consumed = await PendingSignup.findOneAndUpdate(
        {
            _id: pendingSignup._id,
            consumedAt: null,
            expiresAt: { $gt: new Date() }
        },
        { $set: { consumedAt: new Date() } },
        { new: true }
    ).select('+passwordHash')

    if (!consumed) {
        throw new OtpChallengeError('This signup OTP challenge is invalid or expired.', 400, 'SIGNUP_OTP_CHALLENGE_INVALID')
    }

    return consumed
}

const retrySignupChallenge = async ({ challengeToken, role, retryChannel }) => {
    const pendingSignup = await findActiveSignup({ challengeToken, role })

    if (pendingSignup.retryAvailableAt && pendingSignup.retryAvailableAt > new Date()) {
        const seconds = Math.ceil((pendingSignup.retryAvailableAt.getTime() - Date.now()) / 1000)
        throw new OtpChallengeError(
            `Please wait ${seconds}s before requesting another OTP.`,
            429,
            'OTP_RETRY_COOLDOWN'
        )
    }

    let providerResponse
    try {
        providerResponse = await msg91OtpService.retryOtp(pendingSignup.reqId, retryChannel)
    } catch (error) {
        throw new OtpChallengeError(
            'We could not resend the OTP. Please try again later.',
            503,
            'OTP_RETRY_FAILED'
        )
    }

    const cooldownSeconds = getResendCooldownSeconds()
    pendingSignup.reqId = providerResponse.reqId || pendingSignup.reqId
    pendingSignup.retryAvailableAt = new Date(Date.now() + cooldownSeconds * 1000)
    await pendingSignup.save()

    return {
        maskedIdentifier: pendingSignup.maskedIdentifier,
        resendCooldownSeconds: cooldownSeconds
    }
}

const findActiveChallenge = async ({ challengeToken, role, purpose = LOGIN_PURPOSE }) => {
    if (!challengeToken) {
        throw new OtpChallengeError('OTP challenge token is required.', 400, 'OTP_CHALLENGE_REQUIRED')
    }

    const challenge = await OtpChallenge
        .findOne({
            challengeTokenHash: hashToken(challengeToken),
            role,
            purpose,
            consumedAt: null,
            expiresAt: { $gt: new Date() }
        })
        .select('+challengeTokenHash')

    if (!challenge) {
        throw new OtpChallengeError('This OTP challenge is invalid or expired.', 400, 'OTP_CHALLENGE_INVALID')
    }

    return challenge
}

const verifyLoginChallenge = async ({ challengeToken, role, otp }) => {
    if (!otp) {
        throw new OtpChallengeError('OTP is required.', 400, 'OTP_REQUIRED')
    }

    const challenge = await findActiveChallenge({
        challengeToken,
        role,
        purpose: LOGIN_PURPOSE
    })

    if (challenge.attempts >= getMaxAttempts()) {
        challenge.consumedAt = new Date()
        await challenge.save()
        throw new OtpChallengeError('Too many OTP attempts. Please login again.', 429, 'OTP_MAX_ATTEMPTS')
    }

    challenge.attempts += 1
    challenge.lastAttemptAt = new Date()
    await challenge.save()

    try {
        const verification = await msg91OtpService.verifyOtp(challenge.reqId, otp)
        if (verification.accessToken) {
            await msg91OtpService.verifyAccessToken(verification.accessToken)
        }
    } catch (error) {
        throw new OtpChallengeError('The OTP you entered is invalid or expired.', 400, 'OTP_VERIFY_FAILED')
    }

    const consumed = await OtpChallenge.findOneAndUpdate(
        {
            _id: challenge._id,
            consumedAt: null,
            expiresAt: { $gt: new Date() }
        },
        { $set: { consumedAt: new Date() } },
        { new: true }
    )

    if (!consumed) {
        throw new OtpChallengeError('This OTP challenge is invalid or expired.', 400, 'OTP_CHALLENGE_INVALID')
    }

    return consumed
}

const retryLoginChallenge = async ({ challengeToken, role, retryChannel }) => {
    const challenge = await findActiveChallenge({
        challengeToken,
        role,
        purpose: LOGIN_PURPOSE
    })

    if (challenge.retryAvailableAt && challenge.retryAvailableAt > new Date()) {
        const seconds = Math.ceil((challenge.retryAvailableAt.getTime() - Date.now()) / 1000)
        throw new OtpChallengeError(
            `Please wait ${seconds}s before requesting another OTP.`,
            429,
            'OTP_RETRY_COOLDOWN'
        )
    }

    let providerResponse
    try {
        providerResponse = await msg91OtpService.retryOtp(challenge.reqId, retryChannel)
    } catch (error) {
        throw new OtpChallengeError(
            'We could not resend the OTP. Please try again later.',
            503,
            'OTP_RETRY_FAILED'
        )
    }

    const cooldownSeconds = getResendCooldownSeconds()
    challenge.reqId = providerResponse.reqId || challenge.reqId
    challenge.retries += 1
    challenge.retryAvailableAt = new Date(Date.now() + cooldownSeconds * 1000)
    await challenge.save()

    return {
        maskedIdentifier: challenge.maskedIdentifier,
        resendCooldownSeconds: cooldownSeconds
    }
}

module.exports = {
    LOGIN_PURPOSE,
    SIGNUP_PURPOSE,
    OtpChallengeError,
    createLoginChallenge,
    createSignupChallenge,
    retryLoginChallenge,
    retrySignupChallenge,
    verifyLoginChallenge,
    verifySignupChallenge,
    normalizeOtpIdentifier,
    maskIdentifier
}
