const authOrderModel = require('../../models/authOrder')
const customerOrder = require('../../models/customerOrder')
const cardModel = require('../../models/cardModel')
const myShopWallet = require('../../models/myShopWallet')
const sellerWallet = require('../../models/sellerWallet')
const {
    cancelExpiredOrderById,
    reconcileOrdersAutoCancellation
} = require('../../services/order/orderAutoCancelService')
const orderStatusService = require('../../services/order/orderStatusService')
const {
    normalizeDeliveryStatus,
    normalizeOrderStatus,
    isValidDeliveryStatus,
    isValidOrderStatus
} = require('../../validations/orderStatusValidation')

const { mongo: { ObjectId } } = require('mongoose')
const { responseReturn } = require('../../utiles/response')
const { getCommissionSettings } = require('../../utiles/commissionConfig')
const { getOrderShippingFee } = require('../../utiles/shippingConfig')
const {
    calculateCheckoutOrderSummary,
    calculateSellerOrderSummary,
    enrichCustomerOrder,
    enrichSellerOrder,
    enrichCustomerOrderWithSuborders
} = require('../../utiles/orderFinancials')
const moment = require('moment')
const crypto = require('crypto')
const Razorpay = require('razorpay')

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
})

class orderController {
    sync_customer_order_state = async (parentOrderId) => {
        const subOrders = await authOrderModel.find({
            orderId: new ObjectId(parentOrderId)
        }).select('order_status delivery_status')

        if (!subOrders.length) {
            return
        }

        const aggregatedDeliveryStatus = orderStatusService.getDeliveryStatusAggregation(
            subOrders.map((item) => item.delivery_status)
        )

        const aggregatedOrderStatus = orderStatusService.getOrderStatusAggregation(
            subOrders.map((item) => item.order_status)
        )

        const updateData = {
            delivery_status: aggregatedDeliveryStatus
        }

        if (aggregatedOrderStatus) {
            updateData.order_status = aggregatedOrderStatus
        }

        await customerOrder.findByIdAndUpdate(parentOrderId, updateData)
    }

    load_customer_order = async (orderId, options = {}) => {
        const referenceTime = options.referenceTime || new Date()

        await cancelExpiredOrderById(orderId, referenceTime)

        return customerOrder.findById(orderId)
    }

    reconcile_customer_orders = async (orders = [], options = {}) => {
        const referenceTime = options.referenceTime || new Date()
        const cancelledCount = await reconcileOrdersAutoCancellation(
            orders,
            referenceTime
        )

        return {
            referenceTime,
            cancelledCount
        }
    }

    /* ================================================= */
    /* PLACE ORDER                                      */
    /* ================================================= */
    place_order = async (req, res) => {

        try {

            const {
                price,
                products,
                shippingInfo,
                userId,
                payment_type
            } = req.body

            if (!payment_type) {
                return responseReturn(res, 400, { message: 'payment_type required' })
            }

            if (!userId || !products?.length || !shippingInfo) {
                return responseReturn(res, 400, { message: 'Invalid order data' })
            }

            const requestedProductTotal = Number(price)
            const requestedShippingFee = Number(req.body?.shipping_fee)
            const tempDate = new Date()
            const resolvedShippingFee = await getOrderShippingFee(products.length)

            /* -------- FETCH COMMISSION SETTINGS -------- */

            const commissionSettings = await getCommissionSettings()
            const commissionPercent = commissionSettings.commission_percent || 0

            // IMPORTANT:
            // product_total = only product value
            // shipping_fee = separate from product_total
            // commission applies only on product_total
            // DO NOT recompute these values differently in other layers.
            const checkoutSummary = calculateCheckoutOrderSummary({
                sellerGroups: products,
                commissionPercent,
                shippingFeePerGroup: products.length > 0 ? resolvedShippingFee / products.length : 0
            })

            if (!checkoutSummary.seller_summaries.length) {
                return responseReturn(res, 400, { message: 'Invalid order amount' })
            }

            if (checkoutSummary.product_total < 0 || checkoutSummary.final_total < 0) {
                return responseReturn(res, 400, { message: 'Invalid order amount' })
            }

            const shouldTraceFinancials = String(process.env.ORDER_DEBUG_TRACE || '').trim().toLowerCase() === 'true'
            const productTotalMismatch = Number.isFinite(requestedProductTotal) && requestedProductTotal !== checkoutSummary.product_total
            const shippingMismatch = Number.isFinite(requestedShippingFee) && requestedShippingFee !== checkoutSummary.shipping_fee

            if (shouldTraceFinancials || productTotalMismatch || shippingMismatch) {
                console.log('ORDER_FINANCIAL_TRACE', {
                    requested_product_total: requestedProductTotal,
                    requested_shipping_fee: requestedShippingFee,
                    computed_subtotal: checkoutSummary.subtotal,
                    computed_discount: checkoutSummary.discount,
                    computed_product_total: checkoutSummary.product_total,
                    computed_shipping_fee: checkoutSummary.shipping_fee,
                    computed_final_total: checkoutSummary.final_total,
                    commission_percent: checkoutSummary.commission_percent,
                    commission_amount: checkoutSummary.commission_amount,
                    seller_earning: checkoutSummary.seller_earning,
                    admin_earning: checkoutSummary.admin_earning,
                    payment_type,
                    seller_groups: checkoutSummary.seller_summaries.map((item) => ({
                        sellerId: item.sellerId,
                        product_total: item.product_total,
                        shipping_fee: item.shipping_fee,
                        commission_amount: item.commission_amount,
                        seller_earning: item.seller_earning
                    }))
                })
            }

            let authorOrderData = []
            let cardId = []
            let customerOrderProduct = []

            /* -------- BUILD CUSTOMER PRODUCT LIST -------- */

            for (let i = 0; i < products.length; i++) {

                const pro = products[i].products

                for (let j = 0; j < pro.length; j++) {

                    customerOrderProduct.push({
                        ...pro[j].productInfo,
                        quantity: pro[j].quantity
                    })

                    if (pro[j]._id) cardId.push(pro[j]._id)
                }
            }

            /* -------- CREATE MAIN ORDER -------- */

            const order = await customerOrder.create({
                customerId: userId,
                shippingInfo: { ...shippingInfo },
                products: customerOrderProduct,
                price: checkoutSummary.final_total,
                shipping_fee: checkoutSummary.shipping_fee,
                product_total: checkoutSummary.product_total,
                commission_percent: checkoutSummary.commission_percent,
                commission_amount: checkoutSummary.commission_amount,
                seller_earning: checkoutSummary.seller_earning,
                payment_type,
                payment_status: payment_type === 'cod' ? 'cod' : 'pending',
                delivery_status: 'PENDING',
                order_status: 'PENDING',
                date: tempDate
            })

            /* -------- CREATE SELLER SUBORDERS -------- */

            for (let i = 0; i < products.length; i++) {

                const sellerSummary = checkoutSummary.seller_summaries[i] || {
                    sellerId: products[i].sellerId,
                    products: products[i].products,
                    product_total: Number(products[i].price) || 0,
                    shipping_fee: 0,
                    commission_percent: checkoutSummary.commission_percent,
                    commission_amount: 0,
                    seller_earning: Number(products[i].price) || 0
                }
                const pro = sellerSummary.products || products[i].products
                const sellerId = sellerSummary.sellerId || products[i].sellerId

                let storePro = []

                for (let j = 0; j < pro.length; j++) {
                    storePro.push({
                        ...pro[j].productInfo,
                        quantity: pro[j].quantity
                    })
                }

                // IMPORTANT:
                // Seller order price must stay as pure product_total only.
                // Do NOT subtract discount or commission here.
                // Commission is already computed in the shared financial summary.
                authorOrderData.push({
                    orderId: order._id,
                    sellerId,
                    products: storePro,
                    price: sellerSummary.product_total,
                    shipping_fee: sellerSummary.shipping_fee,
                    commission_percent: sellerSummary.commission_percent,
                    commission_amount: sellerSummary.commission_amount,
                    seller_earning: sellerSummary.seller_earning,
                    payment_type,
                    payment_status: payment_type === 'cod' ? 'cod' : 'pending',
                    shippingInfo: { ...shippingInfo },
                    delivery_status: 'PENDING',
                    order_status: 'PENDING',
                    date: tempDate
                })
            }

            await authOrderModel.insertMany(authorOrderData)

            /* -------- CLEAR CART -------- */

            for (let k = 0; k < cardId.length; k++) {
                await cardModel.findByIdAndDelete(cardId[k])
            }

            /* -------- ONLINE PAYMENT -------- */

            if (payment_type === 'online') {

                try {

                    const razorpayOrder = await razorpay.orders.create({
                        amount: Math.round(checkoutSummary.final_total * 100),
                        currency: "INR",
                        receipt: order._id.toString(),
                        notes: { orderId: order._id.toString() }
                    })

                    await customerOrder.findByIdAndUpdate(order._id, {
                        razorpay_order_id: razorpayOrder.id
                    })

                    return responseReturn(res, 201, {
                        orderId: order._id,
                        razorpayOrder
                    })

                } catch (razorError) {

                    await customerOrder.findByIdAndUpdate(order._id, {
                        order_status: 'REJECT',
                        delivery_status: 'cancelled'
                    })

                    await authOrderModel.updateMany(
                        { orderId: order._id },
                        {
                            order_status: 'REJECT',
                            delivery_status: 'cancelled'
                        }
                    )

                    return responseReturn(res, 500, {
                        message: 'Payment gateway error'
                    })
                }
            }

            /* -------- COD -------- */

            return responseReturn(res, 201, {
                orderId: order._id,
                message: 'COD order placed'
            })

        } catch (error) {
            console.log("place_order error:", error)
            return responseReturn(res, 500, { message: 'order failed' })
        }
    }

    update_order_payment_status = async (orderId, paymentStatus, razorpayPaymentId = null) => {
        const customerUpdate = {
            payment_status: paymentStatus
        }

        if (razorpayPaymentId) {
            customerUpdate.razorpay_payment_id = razorpayPaymentId
        }

        await customerOrder.findByIdAndUpdate(orderId, customerUpdate)
        await authOrderModel.updateMany(
            { orderId: new ObjectId(orderId) },
            { payment_status: paymentStatus }
        )
    }

    create_payment = async (req, res) => {
        try {

            const { orderId } = req.body

            if (!orderId || !ObjectId.isValid(orderId)) {
                return responseReturn(res, 400, { message: 'Valid orderId required' })
            }

            const order = await this.load_customer_order(orderId)

            if (!order) {
                return responseReturn(res, 404, { message: 'Order not found' })
            }

            if (order.payment_type !== 'online') {
                return responseReturn(res, 400, { message: 'This order is not eligible for online payment' })
            }

            if (normalizeOrderStatus(order.order_status) === 'REJECT' || normalizeDeliveryStatus(order.delivery_status) === 'cancelled') {
                return responseReturn(res, 400, { message: 'Order already cancelled' })
            }

            if (order.payment_status === 'paid') {
                return responseReturn(res, 200, { message: 'Order already paid', orderId: order._id })
            }

            const razorpayOrder = await razorpay.orders.create({
                amount: Math.round(order.price * 100),
                currency: 'INR',
                receipt: order._id.toString(),
                notes: { orderId: order._id.toString() }
            })

            await customerOrder.findByIdAndUpdate(order._id, {
                razorpay_order_id: razorpayOrder.id,
                razorpay_payment_id: null
            })

            return responseReturn(res, 200, {
                orderId: order._id,
                razorpayOrder
            })

        } catch (error) {
            console.log('create_payment error:', error)
            return responseReturn(res, 500, { message: 'Unable to create payment order' })
        }
    }

    verify_online_payment = async (req, res) => {
        try {

            const {
                orderId,
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature
            } = req.body

            if (
                !orderId ||
                !ObjectId.isValid(orderId) ||
                !razorpay_order_id ||
                !razorpay_payment_id ||
                !razorpay_signature
            ) {
                return responseReturn(res, 400, { message: 'Incomplete payment data' })
            }

            const keySecret = process.env.RAZORPAY_KEY_SECRET

            if (!keySecret) {
                return responseReturn(res, 500, { message: 'Razorpay key secret missing' })
            }

            const generatedSignature = crypto
                .createHmac('sha256', keySecret)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest('hex')

            if (generatedSignature !== razorpay_signature) {
                return responseReturn(res, 400, { message: 'Invalid Razorpay signature' })
            }

            const order = await this.load_customer_order(orderId)

            if (!order) {
                return responseReturn(res, 404, { message: 'Order not found' })
            }

            if (order.payment_type !== 'online' && order.payment_type !== 'cod') {
                return responseReturn(res, 400, { message: 'This order payment type is not supported' })
            }

            if (normalizeOrderStatus(order.order_status) === 'REJECT' || normalizeDeliveryStatus(order.delivery_status) === 'cancelled') {
                return responseReturn(res, 400, { message: 'Order already cancelled' })
            }

            if (order.razorpay_order_id !== razorpay_order_id) {
                return responseReturn(res, 400, { message: 'Razorpay order mismatch' })
            }

            if (order.payment_status === 'paid') {
                return responseReturn(res, 200, { message: 'Payment already verified' })
            }

            await this.update_order_payment_status(orderId, 'paid', razorpay_payment_id)

            return responseReturn(res, 200, { message: 'Payment verified', orderId })

        } catch (error) {
            console.log('verify_online_payment error:', error)
            return responseReturn(res, 500, { message: 'Payment verification failed' })
        }
    }

    cod_confirm = async (req, res) => {
        try {
            const { orderId } = req.params

            if (!orderId || !ObjectId.isValid(orderId)) {
                return responseReturn(res, 400, { message: 'Valid orderId required' })
            }

            const order = await this.load_customer_order(orderId)

            if (!order) {
                return responseReturn(res, 404, { message: 'Order not found' })
            }

            if (order.payment_type !== 'cod') {
                return responseReturn(res, 400, { message: 'This order is not COD type' })
            }

            if (normalizeOrderStatus(order.order_status) === 'REJECT' || normalizeDeliveryStatus(order.delivery_status) === 'cancelled') {
                return responseReturn(res, 400, { message: 'Order already cancelled' })
            }

            await this.update_order_payment_status(orderId, 'cod')
            return responseReturn(res, 200, { message: 'COD confirmed' })
        } catch (error) {
            console.log('cod_confirm error:', error)
            return responseReturn(res, 500, { message: 'Unable to confirm COD' })
        }
    }

    /* ================================================= */
    /* VERIFY RAZORPAY WEBHOOK                          */
    /* ================================================= */
    order_confirm = async (req, res) => {

        try {

            const secret = process.env.RAZORPAY_WEBHOOK_SECRET
            const rawBody = req.rawBody
            const signatureHeader = req.headers["x-razorpay-signature"]

            if (!secret || !rawBody || !signatureHeader) {
                return res.status(400).json({ message: "Webhook data missing" })
            }

            const razorpaySignature = Array.isArray(signatureHeader)
                ? signatureHeader[0]
                : signatureHeader

            const generatedSignature = crypto
                .createHmac("sha256", secret)
                .update(rawBody)
                .digest("hex")

            const generatedBuffer = Buffer.from(generatedSignature, 'utf8')
            const receivedBuffer = Buffer.from(razorpaySignature, 'utf8')

            if (
                generatedBuffer.length !== receivedBuffer.length ||
                !crypto.timingSafeEqual(generatedBuffer, receivedBuffer)
            ) {
                return res.status(400).json({ message: "Invalid signature" })
            }

            const event = req.body.event

            if (event === "payment.captured") {

                const payment = req.body.payload.payment.entity
                let existingOrder = null

                if (payment.notes?.orderId) {
                    existingOrder = await customerOrder.findById(payment.notes.orderId)
                }

                if (!existingOrder && payment.order_id) {
                    existingOrder = await customerOrder.findOne({
                        razorpay_order_id: payment.order_id
                    })
                }

                if (!existingOrder) {
                    return res.status(404).json({ message: "Order not found" })
                }

                if (existingOrder.payment_status !== "pending") {
                    return res.status(200).json({ message: "Already processed" })
                }

                if (
                    normalizeOrderStatus(existingOrder.order_status) === 'REJECT' ||
                    normalizeDeliveryStatus(existingOrder.delivery_status) === 'cancelled'
                ) {
                    return res.status(409).json({ message: 'Order already cancelled' })
                }

                await this.update_order_payment_status(
                    existingOrder._id.toString(),
                    "paid",
                    payment.id
                )

                return res.status(200).json({ message: "Payment verified" })
            }

            if (event === "payment.failed") {

                const payment = req.body.payload.payment.entity
                let existingOrder = null

                if (payment.notes?.orderId) {
                    existingOrder = await customerOrder.findById(payment.notes.orderId)
                }

                if (!existingOrder && payment.order_id) {
                    existingOrder = await customerOrder.findOne({
                        razorpay_order_id: payment.order_id
                    })
                }

                if (existingOrder) {
                    await this.update_order_payment_status(
                        existingOrder._id.toString(),
                        "failed"
                    )
                }

                return res.status(200).json({ message: "Payment failed updated" })
            }

            return res.status(200).json({ message: "Event ignored" })

        } catch (error) {
            console.log("Webhook error:", error)
            return res.status(500).json({ message: "Verification failed" })
        }
    }

    /* ================================================= */
    /* CUSTOMER DASHBOARD                               */
    /* ================================================= */
    get_customer_databorad_data = async (req, res) => {

        const { userId } = req.params

        try {

            let recentOrders = await customerOrder
                .find({ customerId: new ObjectId(userId) })
                .sort({ createdAt: -1 })
                .limit(5)

            const recentOrderReconciliation = await this.reconcile_customer_orders(recentOrders)

            if (recentOrderReconciliation.cancelledCount) {
                recentOrders = await customerOrder
                    .find({ customerId: new ObjectId(userId) })
                    .sort({ createdAt: -1 })
                    .limit(5)
            }

            const responseTime = new Date()
            const pendingOrder = await customerOrder.countDocuments({
                customerId: new ObjectId(userId),
                delivery_status: { $in: ['PENDING', 'pending'] }
            })

            const cancelledOrder = await customerOrder.countDocuments({
                customerId: new ObjectId(userId),
                delivery_status: 'cancelled'
            })

            const totalOrder = await customerOrder.countDocuments({
                customerId: new ObjectId(userId)
            })

            responseReturn(res, 200, {
                serverTime: responseTime.toISOString(),
                recentOrders: recentOrders.map((order) => enrichCustomerOrder(order, { referenceTime: responseTime })),
                pendingOrder,
                cancelledOrder,
                totalOrder
            })

        } catch (error) {
            console.log(error)
        }
    }

    /* ================================================= */
    /* CUSTOMER ORDERS                                  */
    /* ================================================= */
    get_orders = async (req, res) => {

        const { customerId, status } = req.params

        try {

            const query = {
                customerId: new ObjectId(customerId)
            }

            if (status !== 'all') {
                const normalizedStatus = normalizeDeliveryStatus(status)
                query.delivery_status = {
                    $in: [status, normalizedStatus].filter(Boolean)
                }
            }

            let orders = await customerOrder.find(query).sort({ createdAt: -1 })
            const orderReconciliation = await this.reconcile_customer_orders(orders)

            if (orderReconciliation.cancelledCount) {
                orders = await customerOrder.find(query).sort({ createdAt: -1 })
            }

            const responseTime = new Date()

            responseReturn(res, 200, {
                serverTime: responseTime.toISOString(),
                orders: orders.map((order) => enrichCustomerOrder(order, { referenceTime: responseTime }))
            })

        } catch (error) {
            console.log(error)
        }
    }

    get_order = async (req, res) => {

        const { orderId } = req.params

        try {
            if (!orderId || !ObjectId.isValid(orderId)) {
                return responseReturn(res, 400, { message: 'Valid orderId required' })
            }
            const order = await this.load_customer_order(orderId)
            const responseTime = new Date()
            responseReturn(res, 200, {
                serverTime: responseTime.toISOString(),
                order: order ? enrichCustomerOrder(order, { referenceTime: responseTime }) : null
            })
        } catch (error) {
            console.log(error)
        }
    }

    customer_order_cancel = async (req, res) => {
        const { orderId } = req.params
        const customerId = req.id || req.body?.customerId || req.body?.userId

        try {
            if (!orderId || !ObjectId.isValid(orderId)) {
                return responseReturn(res, 400, { message: 'Valid orderId required' })
            }

            if (!customerId || !ObjectId.isValid(customerId)) {
                return responseReturn(res, 400, { message: 'Valid customerId required' })
            }

            const order = await this.load_customer_order(orderId)

            if (!order) {
                return responseReturn(res, 404, { message: 'Order not found' })
            }

            if (String(order.customerId) !== String(customerId)) {
                return responseReturn(res, 401, { message: 'unauthorized' })
            }

            if (order.delivery_status === 'cancelled') {
                return responseReturn(res, 400, { message: 'Order already cancelled' })
            }

            if (normalizeOrderStatus(order.order_status) === 'REJECT') {
                return responseReturn(res, 400, { message: 'Order already rejected' })
            }

            if (normalizeOrderStatus(order.order_status) === 'ACCEPT') {
                return responseReturn(res, 400, { message: 'Order already accepted, cannot cancel' })
            }

            const acceptedSubOrder = await authOrderModel.findOne({
                orderId: new ObjectId(orderId),
                order_status: 'ACCEPT'
            })

            if (acceptedSubOrder) {
                return responseReturn(res, 400, { message: 'Order already accepted, cannot cancel' })
            }

            await customerOrder.findByIdAndUpdate(orderId, {
                order_status: 'REJECT',
                delivery_status: 'cancelled'
            })

            await authOrderModel.updateMany(
                { orderId: new ObjectId(orderId) },
                {
                    order_status: 'REJECT',
                    delivery_status: 'cancelled'
                }
            )

            responseReturn(res, 200, { message: 'Order cancelled successfully' })
        } catch (error) {
            console.log(error)
            responseReturn(res, 500, { message: 'Internal server error' })
        }
    }

    /* ================================================= */
    /* ADMIN ORDERS                                     */
    /* ================================================= */
    get_admin_orders = async (req, res) => {

        let { page, parPage } = req.query
        const searchValue = String(req.query?.searchValue || '').trim()
        page = parseInt(page)
        parPage = parseInt(parPage)

        if (Number.isNaN(page) || page < 1) page = 1
        if (Number.isNaN(parPage) || parPage < 1) parPage = 5

        const skipPage = parPage * (page - 1)

        try {
            const matchStage = {}

            if (searchValue) {
                const searchRegex = new RegExp(searchValue, 'i')
                const searchConditions = [
                    { payment_status: searchRegex },
                    { delivery_status: searchRegex },
                    { order_status: searchRegex },
                    { date: searchRegex }
                ]

                if (ObjectId.isValid(searchValue)) {
                    searchConditions.unshift({ _id: new ObjectId(searchValue) })
                }

                matchStage.$or = searchConditions
            }

            const pipeline = []

            if (Object.keys(matchStage).length) {
                pipeline.push({ $match: matchStage })
            }

            pipeline.push(
                {
                    $lookup: {
                        from: 'authororders',
                        localField: "_id",
                        foreignField: 'orderId',
                        as: 'suborder'
                    }
                },
                { $sort: { createdAt: -1 } },
                { $skip: skipPage },
                { $limit: parPage }
            )

            const orders = await customerOrder.aggregate(pipeline)

            const totalOrder = Object.keys(matchStage).length
                ? await customerOrder.countDocuments(matchStage)
                : await customerOrder.countDocuments()

            responseReturn(res, 200, {
                orders: orders.map((order) => enrichCustomerOrderWithSuborders(order)),
                totalOrder
            })

        } catch (error) {
            console.log(error)
        }
    }

    get_admin_order = async (req, res) => {

        const { orderId } = req.params

        try {
            if (!orderId || !ObjectId.isValid(orderId)) {
                return responseReturn(res, 400, { message: 'Valid orderId required' })
            }

            const order = await customerOrder.aggregate([
                { $match: { _id: new ObjectId(orderId) } },
                {
                    $lookup: {
                        from: 'authororders',
                        localField: '_id',
                        foreignField: 'orderId',
                        as: 'suborder'
                    }
                }
            ])

            responseReturn(res, 200, {
                order: order[0] ? enrichCustomerOrderWithSuborders(order[0]) : null
            })

        } catch (error) {
            console.log(error)
        }
    }

    /* ================================================= */
    /* ADMIN STATUS UPDATE + WALLET CREDIT              */
    /* ================================================= */
    admin_order_status_update = async (req, res) => {

        const { orderId } = req.params
        const incomingDeliveryStatus =
            req.body?.delivery_status ||
            req.body?.deliveryStatus ||
            req.body?.status
        const incomingOrderStatus =
            req.body?.order_status ||
            req.body?.orderStatus

        try {
            if (req.role !== 'admin') {
                return responseReturn(res, 401, {
                    success: false,
                    message: 'unauthorized'
                })
            }

            if (!orderId || !ObjectId.isValid(orderId)) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Invalid status transition'
                })
            }

            const targetOrder = await customerOrder.findById(orderId)

            if (!targetOrder) {
                return responseReturn(res, 404, {
                    success: false,
                    message: 'Order not found'
                })
            }

            if (!incomingDeliveryStatus && !incomingOrderStatus) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Invalid status transition'
                })
            }

            const updateData = {}

            if (incomingOrderStatus) {
                const normalizedOrderStatus = normalizeOrderStatus(incomingOrderStatus)
                if (!isValidOrderStatus(normalizedOrderStatus) && normalizedOrderStatus !== 'PENDING') {
                    return responseReturn(res, 400, {
                        success: false,
                        message: 'Invalid status transition'
                    })
                }
                updateData.order_status = normalizedOrderStatus
            }

            if (incomingDeliveryStatus) {
                const normalizedDeliveryStatus = normalizeDeliveryStatus(incomingDeliveryStatus)
                if (!isValidDeliveryStatus(normalizedDeliveryStatus)) {
                    return responseReturn(res, 400, {
                        success: false,
                        message: 'Invalid status transition'
                    })
                }
                updateData.delivery_status = normalizedDeliveryStatus
            }

            await customerOrder.findByIdAndUpdate(orderId, updateData)
            await authOrderModel.updateMany(
                { orderId: new ObjectId(orderId) },
                updateData
            )

            const wasDeliveredBefore =
                normalizeDeliveryStatus(targetOrder.delivery_status) === 'DELIVERED'
            const becameDeliveredNow =
                updateData.delivery_status === 'DELIVERED'

            if (becameDeliveredNow && !wasDeliveredBefore) {

                const sellerOrders = await authOrderModel.find({
                    orderId: new ObjectId(orderId),
                    payment_status: 'paid'
                })

                const time = moment(Date.now()).format('l')
                const splitTime = time.split('/')

                for (let i = 0; i < sellerOrders.length; i++) {
                    const sellerFinancials = calculateSellerOrderSummary(sellerOrders[i])
                    const sellerAmount = sellerFinancials.seller_earning
                    const platformCommission = sellerFinancials.admin_earning

                    await sellerWallet.create({
                        sellerId: sellerOrders[i].sellerId.toString(),
                        amount: sellerAmount,
                        manth: splitTime[0],
                        year: splitTime[2],
                    })

                    await myShopWallet.create({
                        amount: platformCommission,
                        manth: splitTime[0],
                        year: splitTime[2],
                    })
                }
            }

            responseReturn(res, 200, {
                success: true,
                message: 'Status updated successfully'
            })

        } catch (error) {
            console.log(error)
            responseReturn(res, 500, {
                success: false,
                message: 'Internal server error'
            })
        }
    }

    /* ================================================= */
    /* SELLER ORDERS                                    */
    /* ================================================= */
    get_seller_orders = async (req, res) => {

        const { sellerId } = req.params
        let { page, parPage } = req.query

        page = parseInt(page)
        parPage = parseInt(parPage)

        const skipPage = parPage * (page - 1)

        try {

            const orders = await authOrderModel.find({ sellerId })
                .skip(skipPage)
                .limit(parPage)
                .sort({ createdAt: -1 })

            const totalOrder = await authOrderModel.countDocuments({ sellerId })

            responseReturn(res, 200, {
                orders: orders.map((order) => enrichSellerOrder(order)),
                totalOrder
            })

        } catch (error) {
            console.log(error)
        }
    }

    get_seller_order = async (req, res) => {

        const { orderId } = req.params

        try {
            if (!orderId || !ObjectId.isValid(orderId)) {
                return responseReturn(res, 400, { message: 'Valid orderId required' })
            }
            const order = await authOrderModel.findById(orderId)
            responseReturn(res, 200, {
                order: order ? enrichSellerOrder(order) : null
            })
        } catch (error) {
            console.log(error)
        }
    }

    seller_order_status_update = async (req, res) => {

        const { orderId } = req.params
        const incomingStatus = req.body?.status || req.body?.order_status

        try {
            const roleValidation = orderStatusService.ensureRole(req.role)

            if (!roleValidation.success) {
                return responseReturn(res, roleValidation.code, {
                    success: false,
                    message: roleValidation.message
                })
            }

            if (!orderId || !ObjectId.isValid(orderId)) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Invalid status transition'
                })
            }

            const sellerOrder = await authOrderModel.findById(orderId)

            if (!sellerOrder) {
                return responseReturn(res, 404, {
                    success: false,
                    message: 'Order not found'
                })
            }

            const canAccess = orderStatusService.isOwnerOrAdmin(
                req.role,
                req.id,
                sellerOrder.sellerId
            )

            if (!canAccess) {
                return responseReturn(res, 401, {
                    success: false,
                    message: 'unauthorized'
                })
            }

            const orderValidation = orderStatusService.validateOrderStatusUpdate(
                sellerOrder.order_status,
                incomingStatus
            )

            if (!orderValidation.success) {
                return responseReturn(res, orderValidation.code, {
                    success: false,
                    message: orderValidation.message
                })
            }

            const orderUpdateData = {
                order_status: orderValidation.data.order_status
            }

            if (orderValidation.data.order_status === 'REJECT') {
                orderUpdateData.delivery_status = 'cancelled'
            }

            await authOrderModel.findByIdAndUpdate(orderId, orderUpdateData)

            await this.sync_customer_order_state(sellerOrder.orderId)

            responseReturn(res, 200, {
                success: true,
                message: 'Status updated successfully'
            })

        } catch (error) {
            responseReturn(res, 500, {
                success: false,
                message: 'Internal server error'
            })
        }
    }

    seller_delivery_status_update = async (req, res) => {
        const { orderId } = req.params
        const incomingStatus = req.body?.status || req.body?.delivery_status

        try {
            const roleValidation = orderStatusService.ensureRole(req.role)

            if (!roleValidation.success) {
                return responseReturn(res, roleValidation.code, {
                    success: false,
                    message: roleValidation.message
                })
            }

            if (!orderId || !ObjectId.isValid(orderId)) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Invalid status transition'
                })
            }

            const sellerOrder = await authOrderModel.findById(orderId)

            if (!sellerOrder) {
                return responseReturn(res, 404, {
                    success: false,
                    message: 'Order not found'
                })
            }

            const canAccess = orderStatusService.isOwnerOrAdmin(
                req.role,
                req.id,
                sellerOrder.sellerId
            )

            if (!canAccess) {
                return responseReturn(res, 401, {
                    success: false,
                    message: 'unauthorized'
                })
            }

            const deliveryValidation = orderStatusService.validateDeliveryStatusUpdate(
                sellerOrder.delivery_status,
                incomingStatus,
                sellerOrder.order_status
            )

            if (!deliveryValidation.success) {
                return responseReturn(res, deliveryValidation.code, {
                    success: false,
                    message: deliveryValidation.message
                })
            }

            await authOrderModel.findByIdAndUpdate(orderId, {
                delivery_status: deliveryValidation.data.delivery_status
            })

            await this.sync_customer_order_state(sellerOrder.orderId)

            responseReturn(res, 200, {
                success: true,
                message: 'Status updated successfully'
            })

        } catch (error) {
            responseReturn(res, 500, {
                success: false,
                message: 'Internal server error'
            })
        }
    }

}

module.exports = new orderController()
