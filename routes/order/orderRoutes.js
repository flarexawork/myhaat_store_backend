const router = require('express').Router()
const orderController = require('../../controllers/order/orderController')
const { authMiddleware } = require('../../middlewares/authMiddleware')

// ---- customer
router.post('/home/order/palce-order', orderController.place_order)
router.get('/home/customer/gat-dashboard-data/:userId', orderController.get_customer_databorad_data)
router.get('/home/customer/gat-orders/:customerId/:status', orderController.get_orders)
router.get('/home/customer/gat-order/:orderId', orderController.get_order)
router.put('/home/order/cancel/:orderId', orderController.customer_order_cancel)
router.post('/order/create-payment', orderController.create_payment)
router.post('/order/verify-payment', orderController.verify_online_payment)
router.put('/order/cod-confirm/:orderId', orderController.cod_confirm)
router.get(
    '/order/get-order/:orderId',
    authMiddleware,
    orderController.get_order
)

// router.post('/order/create-payment', orderController.create_payment)
router.get('/order/confirm/:orderId', orderController.order_confirm)
router.post('/home/order/place-order', authMiddleware, orderController.place_order)
router.put('/order/confirm/:orderId', authMiddleware, orderController.order_confirm)
router.post('/order/webhook', orderController.order_confirm)


// --- admin
router.get('/admin/orders', orderController.get_admin_orders)
router.get('/admin/order/:orderId', orderController.get_admin_order)
router.put('/admin/order-status/update/:orderId', authMiddleware, orderController.admin_order_status_update)

// ---seller

router.get('/seller/orders/:sellerId', orderController.get_seller_orders)
router.get('/seller/order/:orderId', orderController.get_seller_order)
router.put('/seller/order-status/update/:orderId', authMiddleware, orderController.seller_order_status_update)
router.put('/seller/delivery-status/update/:orderId', authMiddleware, orderController.seller_delivery_status_update)

module.exports = router
