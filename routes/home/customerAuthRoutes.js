const router = require('express').Router()
const { authMiddleware } = require('../../middlewares/authMiddleware')
const { createRateLimit } = require('../../middlewares/securityMiddleware')
const customerAuthController = require('../../controllers/home/customerAuthController')

const passwordChangeRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many password change attempts. Please try again later.',
    keyGenerator: (req) => `${req.id || req.ip}:${req.originalUrl}`
})

router.post('/customer/customer-register', customerAuthController.customer_register)
router.post('/customer/customer-login', customerAuthController.customer_login)
router.get('/auth/verify-email', customerAuthController.verify_email)
router.post('/auth/resend-verification', customerAuthController.resend_verification)
router.post('/auth/forgot-password', customerAuthController.forgot_password)
router.post('/auth/reset-password', customerAuthController.reset_password)
router.post('/auth/refresh-token', customerAuthController.refresh_token)
router.post('/auth/logout', customerAuthController.customer_logout)
router.get('/customer/logout', customerAuthController.customer_logout)
router.put('/user/change-password', authMiddleware, passwordChangeRateLimit, customerAuthController.change_password)
module.exports = router
