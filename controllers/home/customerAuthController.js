const customerModel = require('../../models/customerModel')
const { responseReturn } = require('../../utiles/response')
const {
    createAccessToken,
    createRefreshToken,
    verifyRefreshToken
} = require('../../utiles/tokenCreate')
const sellerCustomerModel = require('../../models/chat/sellerCustomerModel')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const sendMail = require('../../utiles/mailer')
const emailVerificationTemplate = require('../../utiles/Template/emailVerification')
const passwordResetTemplate = require('../../utiles/Template/passwordReset')

const ACCESS_TOKEN_COOKIE = 'customerToken'
const REFRESH_TOKEN_COOKIE = 'customerRefreshToken'
const ACCESS_TOKEN_EXPIRES_MS = 15 * 60 * 1000
const REFRESH_TOKEN_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000
const EMAIL_VERIFICATION_EXPIRES_MS = 24 * 60 * 60 * 1000
const PASSWORD_RESET_EXPIRES_MS = 60 * 60 * 1000

const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex')

const normalizeEmail = (email = '') => email.trim().toLowerCase()

const normalizePhone = (phone = '') => phone.toString().trim()

const buildCustomerPayload = (customer) => ({
    id: customer.id,
    name: customer.name,
    email: customer.email,
    method: customer.method,
    role: 'customer'
})

const getClientBaseUrl = () => {
    return (
        process.env.FRONTEND_URL ||
        process.env.USER_PANEL_PRODUCTION_URL ||
        process.env.USER_PANEL_LCOAL_URL ||
        'http://localhost:3000'
    ).replace(/\/+$/, '')
}

const buildVerificationLink = (token) => `${getClientBaseUrl()}/email-verify?token=${token}`

const sendVerificationEmail = async (customer) => {
    const verificationToken = crypto.randomBytes(32).toString('hex')

    customer.emailVerificationToken = hashToken(verificationToken)
    customer.emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRES_MS)
    await customer.save()

    const verificationLink = buildVerificationLink(verificationToken)
    await sendMail({
        to: customer.email,
        subject: 'Verify Your Email - MyHaat',
        html: emailVerificationTemplate(customer.name, verificationLink)
    })
}

const setCustomerCookies = (res, accessToken, refreshToken) => {
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
        expires: new Date(Date.now() + ACCESS_TOKEN_EXPIRES_MS)
    })

    if (refreshToken) {
        res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
            expires: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_MS),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        })
    }
}

const clearCustomerCookies = (res) => {
    res.cookie(ACCESS_TOKEN_COOKIE, '', {
        expires: new Date(Date.now())
    })
    res.cookie(REFRESH_TOKEN_COOKIE, '', {
        expires: new Date(Date.now()),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    })
}

const getAccessTokenFromRequest = (req) => {
    const { authorization } = req.headers

    if (authorization && authorization.startsWith('Bearer ')) {
        return authorization.split(' ')[1]
    }

    return req.cookies?.[ACCESS_TOKEN_COOKIE]
}

const issueCustomerTokens = async (customer, res) => {
    const payload = buildCustomerPayload(customer)
    const accessToken = await createAccessToken(payload)
    const refreshToken = await createRefreshToken({
        id: customer.id,
        role: 'customer'
    })

    customer.refreshToken = hashToken(refreshToken)
    await customer.save()

    setCustomerCookies(res, accessToken, refreshToken)

    return {
        accessToken,
        refreshToken
    }
}

class customerAuthController {
    customer_register = async (req, res) => {
        const { name, email, password, phone } = req.body

        try {
            if (!phone || !normalizePhone(phone)) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Phone number is required'
                })
            }

            const sanitizedPhone = normalizePhone(phone)
            const phoneDigits = sanitizedPhone.replace(/\D/g, '')

            if (phoneDigits.length < 10 || phoneDigits.length > 15) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Phone number must be between 10 and 15 digits'
                })
            }

            const normalizedEmail = normalizeEmail(email)
            const customer = await customerModel.findOne({ email: normalizedEmail })
            if (customer) {
                return responseReturn(res, 404, { error: 'Email already exits' })
            } else {
                const createCustomer = await customerModel.create({
                    name: name.trim(),
                    email: normalizedEmail,
                    password: await bcrypt.hash(password, 10),
                    phone: sanitizedPhone,
                    method: 'menualy',
                    isEmailVerified: false
                })
                await sellerCustomerModel.create({
                    myId: createCustomer.id
                })

                let emailSent = true
                try {
                    await sendVerificationEmail(createCustomer)
                } catch (mailError) {
                    emailSent = false
                    console.log(mailError.message)
                }

                const { accessToken, refreshToken } = await issueCustomerTokens(createCustomer, res)

                return responseReturn(res, 201, {
                    success: true,
                    message: emailSent
                        ? 'Register success. Please verify your email.'
                        : 'Register success, but the verification email could not be sent.',
                    token: accessToken,
                    accessToken,
                    refreshToken,
                    requiresEmailVerification: true
                })
            }
        } catch (error) {
            console.log(error.message)
            return responseReturn(res, 500, {
                success: false,
                message: 'Internal server error'
            })
        }
    }

    customer_login = async (req, res) => {
        const { email, password } = req.body
        try {
            const customer = await customerModel
                .findOne({ email: normalizeEmail(email) })
                .select('+password')
            if (customer) {
                if (customer.isEmailVerified === false) {
                    return responseReturn(res, 403, {
                        success: false,
                        message: 'Please verify your email before logging in'
                    })
                }

                const match = await bcrypt.compare(password, customer.password)
                if (match) {
                    const { accessToken, refreshToken } = await issueCustomerTokens(customer, res)

                    return responseReturn(res, 201, {
                        success: true,
                        message: 'Login success',
                        token: accessToken,
                        accessToken,
                        refreshToken
                    })
                } else {
                    return responseReturn(res, 404, { error: "Password wrong" })
                }
            } else {
                return responseReturn(res, 404, { error: 'Email not found' })
            }
        } catch (error) {
            console.log(error.message)
            return responseReturn(res, 500, {
                success: false,
                message: 'Internal server error'
            })
        }
    }

    verify_email = async (req, res) => {
        const { token } = req.query

        try {
            if (!token) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Invalid or expired verification link'
                })
            }

            const customer = await customerModel
                .findOne({
                    emailVerificationToken: hashToken(token),
                    emailVerificationExpires: { $gt: new Date() }
                })
                .select('+emailVerificationToken +emailVerificationExpires')

            if (!customer) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Invalid or expired verification link'
                })
            }

            customer.isEmailVerified = true
            customer.emailVerificationToken = null
            customer.emailVerificationExpires = null
            await customer.save()

            return responseReturn(res, 200, {
                success: true,
                message: 'Email verified successfully'
            })
        } catch (error) {
            console.log(error.message)
            return responseReturn(res, 500, {
                success: false,
                message: 'Internal server error'
            })
        }
    }

    resend_verification = async (req, res) => {
        const { email } = req.body

        try {
            if (!email) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Email is required'
                })
            }

            const customer = await customerModel
                .findOne({ email: normalizeEmail(email) })
                .select('+emailVerificationToken +emailVerificationExpires')

            if (!customer) {
                return responseReturn(res, 404, {
                    success: false,
                    message: 'Email not found'
                })
            }

            if (customer.isEmailVerified) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Email already verified'
                })
            }

            await sendVerificationEmail(customer)

            return responseReturn(res, 200, {
                success: true,
                message: 'Verification email sent successfully'
            })
        } catch (error) {
            console.log(error.message)
            return responseReturn(res, 500, {
                success: false,
                message: 'Unable to send verification email'
            })
        }
    }

    forgot_password = async (req, res) => {
        const { email } = req.body

        try {
            if (!email) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Email is required'
                })
            }

            const customer = await customerModel.findOne({
                email: normalizeEmail(email)
            })

            if (!customer) {
                return responseReturn(res, 200, {
                    success: true,
                    message: 'If an account with that email exists, a password reset link has been sent.'
                })
            }

            const resetToken = crypto.randomBytes(32).toString('hex')
            customer.passwordResetToken = hashToken(resetToken)
            customer.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_EXPIRES_MS)
            await customer.save()

            const resetLink = `${getClientBaseUrl()}/reset-password?token=${resetToken}`
            await sendMail({
                to: customer.email,
                subject: 'Reset Your Password - MyHaat',
                html: passwordResetTemplate(customer.name, resetLink)
            })

            return responseReturn(res, 200, {
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.'
            })
        } catch (error) {
            console.log(error.message)
            return responseReturn(res, 500, {
                success: false,
                message: 'Unable to process forgot password request'
            })
        }
    }

    reset_password = async (req, res) => {
        const { token, password } = req.body

        try {
            if (!token || !password) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Token and password are required'
                })
            }

            const customer = await customerModel
                .findOne({
                    passwordResetToken: hashToken(token),
                    passwordResetExpires: { $gt: new Date() }
                })
                .select('+passwordResetToken +passwordResetExpires +refreshToken')

            if (!customer) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Invalid or expired reset token'
                })
            }

            customer.password = await bcrypt.hash(password, 10)
            customer.passwordResetToken = null
            customer.passwordResetExpires = null
            customer.refreshToken = null
            await customer.save()

            clearCustomerCookies(res)

            return responseReturn(res, 200, {
                success: true,
                message: 'Password reset successfully. You can now login.'
            })
        } catch (error) {
            console.log(error.message)
            return responseReturn(res, 500, {
                success: false,
                message: 'Unable to reset password'
            })
        }
    }

    refresh_token = async (req, res) => {
        const providedRefreshToken = req.body?.refreshToken || req.cookies?.[REFRESH_TOKEN_COOKIE]

        try {
            if (!providedRefreshToken) {
                return responseReturn(res, 401, {
                    success: false,
                    message: 'Refresh token is required'
                })
            }

            const decoded = await verifyRefreshToken(providedRefreshToken)
            const customer = await customerModel
                .findOne({
                    _id: decoded.id,
                    refreshToken: hashToken(providedRefreshToken)
                })

            if (!customer) {
                return responseReturn(res, 401, {
                    success: false,
                    message: 'Invalid refresh token'
                })
            }

            if (customer.isEmailVerified === false) {
                return responseReturn(res, 403, {
                    success: false,
                    message: 'Please verify your email before logging in'
                })
            }

            const accessToken = await createAccessToken(buildCustomerPayload(customer))
            setCustomerCookies(res, accessToken, providedRefreshToken)

            return responseReturn(res, 200, {
                success: true,
                accessToken,
                token: accessToken
            })
        } catch (error) {
            console.log(error.message)
            return responseReturn(res, 401, {
                success: false,
                message: 'Invalid or expired refresh token'
            })
        }
    }

    customer_logout = async (req, res) => {
        const providedRefreshToken = req.body?.refreshToken || req.cookies?.[REFRESH_TOKEN_COOKIE]
        const accessToken = getAccessTokenFromRequest(req)

        try {
            let customer = null

            if (providedRefreshToken) {
                try {
                    const decodedRefreshToken = await verifyRefreshToken(providedRefreshToken)
                    customer = await customerModel
                        .findOne({
                            _id: decodedRefreshToken.id,
                            refreshToken: hashToken(providedRefreshToken)
                        })
                        .select('+refreshToken')
                } catch (error) {
                    customer = null
                }
            }

            if (!customer && accessToken) {
                try {
                    const decodedAccessToken = await jwt.verify(accessToken, process.env.SECRET)
                    customer = await customerModel.findById(decodedAccessToken.id).select('+refreshToken')
                } catch (error) {
                    customer = null
                }
            }

            if (customer) {
                customer.refreshToken = null
                await customer.save()
            }

            clearCustomerCookies(res)

            return responseReturn(res, 200, { message: 'Logout success' })
        } catch (error) {
            console.log(error.message)
            return responseReturn(res, 500, {
                success: false,
                message: 'Unable to logout'
            })
        }
    }
}

module.exports = new customerAuthController()
