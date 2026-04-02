const router = require('express').Router()
const { authMiddleware } = require('../../middlewares/authMiddleware')
const {
    get_commission_settings,
    update_commission_settings
} = require('../../controllers/commission/commissionController')

router.get('/admin/commission-settings', authMiddleware, get_commission_settings)
router.put('/admin/commission-settings', authMiddleware, update_commission_settings)

module.exports = router
