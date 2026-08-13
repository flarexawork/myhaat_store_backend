const router = require('express').Router()
const { authMiddleware } = require('../../middlewares/authMiddleware')
const categoryController = require('../../controllers/dashboard/categoryController')

router.post('/category-add', authMiddleware, categoryController.add_category)
router.get('/category-get', authMiddleware, categoryController.get_category)
router.get('/category/:categoryId/variations', authMiddleware, categoryController.get_category_variations)
router.put('/category/:categoryId/variations', authMiddleware, categoryController.update_category_variations)
router.put('/category/:categoryId', authMiddleware, categoryController.update_category)
router.delete('/category/:categoryId', authMiddleware, categoryController.delete_category)

module.exports = router
