const router = require('express').Router()
const { authMiddleware } = require('../middlewares/authMiddleware')
const { createRateLimit } = require('../middlewares/securityMiddleware')
const { sellerVerificationUploadMiddleware } = require('../middlewares/sellerVerificationUploadMiddleware')
const authControllers = require('../controllers/authControllers')
const sellerVerificationController = require('../controllers/sellerVerificationController')

const passwordChangeRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many password change attempts. Please try again later.',
    keyGenerator: (req) => `${req.id || req.ip}:${req.originalUrl}`
})

router.post('/admin-login', authControllers.admin_login)
router.get('/get-user', authMiddleware, authControllers.getUser)
router.get('/seller/profile', authMiddleware, authControllers.getUser)
router.post('/seller-register', authControllers.seller_register)
router.post('/seller-login', authControllers.seller_login)
router.get('/seller-verify-email', authControllers.seller_verify_email)
router.post('/seller-resend-verification', authControllers.seller_resend_verification)
router.post('/seller/complete-verification', authMiddleware, sellerVerificationUploadMiddleware, sellerVerificationController.complete_verification)
router.post('/profile-image-upload',authMiddleware, authControllers.profile_image_upload)
router.post('/profile-info-add',authMiddleware, authControllers.profile_info_add)
router.put('/seller/change-password', authMiddleware, passwordChangeRateLimit, authControllers.seller_change_password)
router.put('/admin/change-password', authMiddleware, passwordChangeRateLimit, authControllers.admin_change_password)
router.put('/admin/update-profile', authMiddleware, authControllers.admin_update_profile)
router.post('/admin/create', authMiddleware, authControllers.create_admin)
router.put('/admin/update-username', authMiddleware, authControllers.update_admin_username)

router.get('/logout',authMiddleware,authControllers.logout)

module.exports = router
