const router = require('express').Router()
const { authMiddleware } = require('../middlewares/authMiddleware')
const {
    get_public_settings,
    get_admin_settings,
    update_admin_settings
} = require('../controllers/settingsController')

router.get('/settings', get_public_settings)
router.get('/admin/settings', authMiddleware, get_admin_settings)
router.put('/admin/settings', authMiddleware, update_admin_settings)

module.exports = router
