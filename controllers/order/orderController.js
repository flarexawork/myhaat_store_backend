const authOrderModel = require('../../models/authOrder')
const customerOrder = require('../../models/customerOrder')
const cardModel = require('../../models/cardModel')
const myShopWallet = require('../../models/myShopWallet')
const sellerWallet = require('../../models/sellerWallet')

const { mongo: { ObjectId } } = require('mongoose')
const { responseReturn } = require('../../utiles/response')
const moment = require('moment')
const crypto = require('crypto')
const Razorpay = require('razorpay')

const razorpay = new Razorpay({
    key_id: process.env.razorpay_key_id,
    key_secret: process.env.razorpay_key_secret
})

class orderController {

    /* ================================================= */
    /* AUTO CANCEL ONLINE UNPAID (15 MIN)               */
    /* ================================================= */
    paymentCheck = async (id) => {
        try {

            const order = await customerOrder.findById(id)

            if (
                order &&
                order.payment_type === 'online' &&
                order.payment_status === 'pending'
            ) {
                await customerOrder.findByIdAndUpdate(id, {
                    delivery_status: 'cancelled'
                })

                await authOrderModel.updateMany(
                    { orderId: id },
                    { delivery_status: 'cancelled' }
                )
            }

        } catch (error) {
            console.log("paymentCheck error:", error)
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
                shipping_fee,
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

            const tempDate = moment(Date.now()).format('LLL')

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
                price: price + shipping_fee,
                payment_type,
                payment_status: payment_type === 'cod' ? 'cod' : 'pending',
                delivery_status: 'pending',
                date: tempDate
            })

            /* -------- CREATE SELLER SUBORDERS -------- */

            for (let i = 0; i < products.length; i++) {

                const pro = products[i].products
                const pri = products[i].price
                const sellerId = products[i].sellerId

                let storePro = []

                for (let j = 0; j < pro.length; j++) {
                    storePro.push({
                        ...pro[j].productInfo,
                        quantity: pro[j].quantity
                    })
                }

                authorOrderData.push({
                    orderId: order._id,
                    sellerId,
                    products: storePro,
                    price: pri,
                    payment_type,
                    payment_status: payment_type === 'cod' ? 'cod' : 'pending',
                    shippingInfo: { ...shippingInfo },
                    delivery_status: 'pending',
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
                        amount: (price + shipping_fee) * 100,
                        currency: "INR",
                        receipt: order._id.toString(),
                        notes: { orderId: order._id.toString() }
                    })

                    await customerOrder.findByIdAndUpdate(order._id, {
                        razorpay_order_id: razorpayOrder.id
                    })

                    setTimeout(() => {
                        this.paymentCheck(order._id)
                    }, 15 * 60 * 1000)

                    return responseReturn(res, 201, {
                        orderId: order._id,
                        razorpayOrder
                    })

                } catch (razorError) {

                    await customerOrder.findByIdAndUpdate(order._id, {
                        delivery_status: 'cancelled'
                    })

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

            const order = await customerOrder.findById(orderId)

            if (!order) {
                return responseReturn(res, 404, { message: 'Order not found' })
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

            const keySecret = process.env.razorpay_key_secret

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

            const order = await customerOrder.findById(orderId)

            if (!order) {
                return responseReturn(res, 404, { message: 'Order not found' })
            }

            if (order.payment_type !== 'online' && order.payment_type !== 'cod') {
                return responseReturn(res, 400, { message: 'This order payment type is not supported' })
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

            const order = await customerOrder.findById(orderId)

            if (!order) {
                return responseReturn(res, 404, { message: 'Order not found' })
            }

            if (order.payment_type !== 'cod') {
                return responseReturn(res, 400, { message: 'This order is not COD type' })
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

            const secret = process.env.razorpay_webhook_secret
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

            const recentOrders = await customerOrder
                .find({ customerId: new ObjectId(userId) })
                .sort({ createdAt: -1 })
                .limit(5)

            const pendingOrder = await customerOrder.countDocuments({
                customerId: new ObjectId(userId),
                delivery_status: 'pending'
            })

            const cancelledOrder = await customerOrder.countDocuments({
                customerId: new ObjectId(userId),
                delivery_status: 'cancelled'
            })

            const totalOrder = await customerOrder.countDocuments({
                customerId: new ObjectId(userId)
            })

            responseReturn(res, 200, {
                recentOrders,
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

            let orders

            if (status !== 'all') {
                orders = await customerOrder.find({
                    customerId: new ObjectId(customerId),
                    delivery_status: status
                }).sort({ createdAt: -1 })
            } else {
                orders = await customerOrder.find({
                    customerId: new ObjectId(customerId)
                }).sort({ createdAt: -1 })
            }

            responseReturn(res, 200, { orders })

        } catch (error) {
            console.log(error)
        }
    }

    get_order = async (req, res) => {

        const { orderId } = req.params

        try {
            const order = await customerOrder.findById(orderId)
            responseReturn(res, 200, { order })
        } catch (error) {
            console.log(error)
        }
    }

    /* ================================================= */
    /* ADMIN ORDERS                                     */
    /* ================================================= */
    get_admin_orders = async (req, res) => {

        let { page, parPage } = req.query
        page = parseInt(page)
        parPage = parseInt(parPage)

        const skipPage = parPage * (page - 1)

        try {

            const orders = await customerOrder.aggregate([
                {
                    $lookup: {
                        from: 'authororders',
                        localField: "_id",
                        foreignField: 'orderId',
                        as: 'suborder'
                    }
                }
            ])
                .skip(skipPage)
                .limit(parPage)
                .sort({ createdAt: -1 })

            const totalOrder = await customerOrder.countDocuments()

            responseReturn(res, 200, { orders, totalOrder })

        } catch (error) {
            console.log(error)
        }
    }

    get_admin_order = async (req, res) => {

        const { orderId } = req.params

        try {

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

            responseReturn(res, 200, { order: order[0] })

        } catch (error) {
            console.log(error)
        }
    }

    /* ================================================= */
    /* ADMIN STATUS UPDATE + WALLET CREDIT              */
    /* ================================================= */
    admin_order_status_update = async (req, res) => {

        const { orderId } = req.params
        const { status } = req.body

        try {

            await customerOrder.findByIdAndUpdate(orderId, {
                delivery_status: status
            })

            await authOrderModel.updateMany(
                { orderId: new ObjectId(orderId) },
                { delivery_status: status }
            )

            if (status === 'delivered') {

                const sellerOrders = await authOrderModel.find({
                    orderId: new ObjectId(orderId),
                    payment_status: 'paid'
                })

                const time = moment(Date.now()).format('l')
                const splitTime = time.split('/')

                for (let i = 0; i < sellerOrders.length; i++) {

                    const commissionPercent = 10

                    const sellerAmount =
                        sellerOrders[i].price -
                        (sellerOrders[i].price * commissionPercent / 100)

                    const platformCommission =
                        sellerOrders[i].price * commissionPercent / 100

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

            responseReturn(res, 200, { message: 'Order status updated' })

        } catch (error) {
            console.log(error)
            responseReturn(res, 500, { message: 'Internal server error' })
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

            responseReturn(res, 200, { orders, totalOrder })

        } catch (error) {
            console.log(error)
        }
    }

    get_seller_order = async (req, res) => {

        const { orderId } = req.params

        try {
            const order = await authOrderModel.findById(orderId)
            responseReturn(res, 200, { order })
        } catch (error) {
            console.log(error)
        }
    }

    seller_order_status_update = async (req, res) => {

        const { orderId } = req.params
        const { status } = req.body

        try {

            await authOrderModel.findByIdAndUpdate(orderId, {
                delivery_status: status
            })

            responseReturn(res, 200, { message: 'Seller order updated' })

        } catch (error) {
            responseReturn(res, 500, { message: 'Internal server error' })
        }
    }

}

module.exports = new orderController()
