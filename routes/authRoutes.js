const router = require('express').Router()
const { authMiddleware } = require('../middlewares/authMiddleware')
const { sellerVerificationUploadMiddleware } = require('../middlewares/sellerVerificationUploadMiddleware')
const authControllers = require('../controllers/authControllers')
const sellerVerificationController = require('../controllers/sellerVerificationController')
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

router.get('/logout',authMiddleware,authControllers.logout)

module.exports = router
