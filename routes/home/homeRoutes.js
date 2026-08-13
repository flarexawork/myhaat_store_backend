const router = require('express').Router()
const homeControllers = require('../../controllers/home/homeControllers')
router.get('/get-categorys', homeControllers.get_categorys)
router.get('/category/:categoryId/variations', homeControllers.get_category_variations)
router.get('/get-products', homeControllers.get_products)
router.get('/get-product/:slug', homeControllers.get_product)
router.get('/product/:productId/check-pincode/:pincode', homeControllers.check_product_pincode)
router.get('/price-range-latest-product', homeControllers.price_range_product)
router.get('/query-products', homeControllers.query_products)

router.post('/customer/submit-review', homeControllers.submit_review)
router.get('/customer/get-reviews/:productId', homeControllers.get_reviews)

module.exports = router
