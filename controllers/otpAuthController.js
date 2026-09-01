const customerModel = require('../models/customerModel')
const sellerModel = require('../models/sellerModel')
const adminModel = require('../models/adminModel')
const sellerCustomerModel = require('../models/chat/sellerCustomerModel')
const { responseReturn } = require('../utiles/response')
const customerAuthController = require('./home/customerAuthController')
const authControllers = require('./authControllers')
const {
    retryLoginChallenge,
    retrySignupChallenge,
    verifyLoginChallenge,
    verifySignupChallenge
} = require('../services/auth/otpChallengeService')

const allowedRoles = ['customer', 'seller', 'admin']

const normalizeRole = (role = '') => role.toString().trim().toLowerCase()

const getRoleFromRequest = (req) => {
    const role = normalizeRole(req.body?.role)
    return allowedRoles.includes(role) ? role : ''
}

const handleOtpError = (res, error) => {
    const statusCode = error.statusCode || 500
    return responseReturn(res, statusCode, {
        success: false,
        message: statusCode === 500
            ? 'We could not verify the OTP. Please try again later.'
            : error.message
    })
}

class otpAuthController {
    verify_login_otp = async (req, res) => {
        const { challengeToken, otp } = req.body
        const role = getRoleFromRequest(req)

        try {
            if (!role) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'A valid account role is required.'
                })
            }

            const challenge = await verifyLoginChallenge({
                challengeToken,
                role,
                otp
            })

            if (challenge.role === 'customer') {
                const customer = await customerModel.findById(challenge.accountId)
                if (!customer) {
                    return responseReturn(res, 404, {
                        success: false,
                        message: 'User account not found.'
                    })
                }

                const { accessToken, refreshToken } = await customerAuthController.issueCustomerTokens(customer, res)
                return responseReturn(res, 200, {
                    success: true,
                    message: 'Login success',
                    token: accessToken,
                    accessToken,
                    refreshToken
                })
            }

            if (challenge.role === 'seller') {
                const seller = await sellerModel.findById(challenge.accountId)
                if (!seller) {
                    return responseReturn(res, 404, {
                        success: false,
                        message: 'User account not found.'
                    })
                }

                const payload = await authControllers.issueSellerLogin(seller, res)
                return responseReturn(res, 200, payload)
            }

            const admin = await adminModel.findById(challenge.accountId)
            if (!admin) {
                return responseReturn(res, 404, {
                    success: false,
                    message: 'User account not found.'
                })
            }

            const payload = await authControllers.issueAdminLogin(admin, res)
            return responseReturn(res, 200, payload)
        } catch (error) {
            return handleOtpError(res, error)
        }
    }

    retry_login_otp = async (req, res) => {
        const { challengeToken, retryChannel } = req.body
        const role = getRoleFromRequest(req)

        try {
            if (!role) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'A valid account role is required.'
                })
            }

            const retry = await retryLoginChallenge({
                challengeToken,
                role,
                retryChannel
            })

            return responseReturn(res, 200, {
                success: true,
                message: 'OTP resent successfully',
                maskedIdentifier: retry.maskedIdentifier,
                resendCooldownSeconds: retry.resendCooldownSeconds
            })
        } catch (error) {
            return handleOtpError(res, error)
        }
    }

    verify_signup_otp = async (req, res) => {
        const { challengeToken, otp } = req.body
        const role = getRoleFromRequest(req)

        try {
            if (!['customer', 'seller'].includes(role)) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'A valid signup role is required.'
                })
            }

            const pendingSignup = await verifySignupChallenge({
                challengeToken,
                role,
                otp
            })

            if (role === 'customer') {
                const duplicate = await customerModel.findOne({ email: pendingSignup.email })
                if (duplicate) {
                    return responseReturn(res, 409, {
                        success: false,
                        message: 'An account with this email address already exists.'
                    })
                }

                const customer = await customerModel.create({
                    name: pendingSignup.name,
                    email: pendingSignup.email,
                    password: pendingSignup.passwordHash,
                    phone: pendingSignup.mobile,
                    method: 'menualy',
                    isEmailVerified: true
                })

                await sellerCustomerModel.create({
                    myId: customer.id
                })

                return responseReturn(res, 201, {
                    success: true,
                    message: 'Signup verified successfully. Please login.'
                })
            }

            const duplicateEmail = await sellerModel.findOne({ email: pendingSignup.email })
            if (duplicateEmail) {
                return responseReturn(res, 409, {
                    success: false,
                    message: 'An account with this email address already exists.'
                })
            }

            const duplicateMobile = await sellerModel.findOne({ mobile: pendingSignup.mobile })
            if (duplicateMobile) {
                return responseReturn(res, 409, {
                    success: false,
                    message: 'An account with this mobile number already exists.'
                })
            }

            const seller = await sellerModel.create({
                name: pendingSignup.name,
                email: pendingSignup.email,
                mobile: pendingSignup.mobile,
                password: pendingSignup.passwordHash,
                method: 'manually',
                shopInfo: {},
                isEmailVerified: true
            })

            await sellerCustomerModel.create({
                myId: seller.id
            })

            return responseReturn(res, 201, {
                success: true,
                message: 'Signup verified successfully. Please login.'
            })
        } catch (error) {
            return handleOtpError(res, error)
        }
    }

    retry_signup_otp = async (req, res) => {
        const { challengeToken, retryChannel } = req.body
        const role = getRoleFromRequest(req)

        try {
            if (!['customer', 'seller'].includes(role)) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'A valid signup role is required.'
                })
            }

            const retry = await retrySignupChallenge({
                challengeToken,
                role,
                retryChannel
            })

            return responseReturn(res, 200, {
                success: true,
                message: 'OTP resent successfully',
                maskedIdentifier: retry.maskedIdentifier,
                resendCooldownSeconds: retry.resendCooldownSeconds
            })
        } catch (error) {
            return handleOtpError(res, error)
        }
    }
}

module.exports = new otpAuthController()
