const paymentAccountModel = require('../../models/paymentAccountModel')
const sellerModel = require('../../models/sellerModel')
const sellerWallet = require('../../models/sellerWallet')
const withdrowRequest = require('../../models/withdrowRequest')
const { responseReturn } = require('../../utiles/response')
const { mongo: { ObjectId } } = require('mongoose')

const Razorpay = require('razorpay')

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
})

class paymentController {

    /* ------------------------------------------------ */
    /* CREATE RAZORPAY ROUTE ACCOUNT */
    /* ------------------------------------------------ */
    create_razorpay_account = async (req, res) => {

        const { id } = req

        try {

            const seller = await sellerModel.findById(id)

            if (!seller) {
                return responseReturn(res, 404, { message: 'Seller not found' })
            }

            // 1️⃣ Create Razorpay Route Account
            const account = await razorpay.accounts.create({
                email: seller.email,
                phone: seller.mobile || "9999999999", // FIXED
                type: "route",
                legal_business_name: seller.shopInfo?.shopName || seller.name,
                business_type: "individual",
                contact_name: seller.name,
                profile: { category: "ecommerce" }
            })

            // 2️⃣ Store Account ID
            await paymentAccountModel.findOneAndUpdate(
                { sellerId: id },
                { razorpayAccountId: account.id },
                { upsert: true, new: true }
            )

            // 3️⃣ Create Onboarding Link (VERY IMPORTANT)
            const accountLink = await razorpay.accountLinks.create({
                account: account.id,
                refresh_url: "http://localhost:3001/reauth",
                return_url: "http://localhost:3001/payment-success",
                type: "account_onboarding"
            })

            // 4️⃣ Return URL to Frontend
            responseReturn(res, 200, {
                message: "Razorpay account created",
                url: accountLink.short_url
            })

        } catch (error) {
            console.log("RAZORPAY ERROR:", error)
            responseReturn(res, 500, { message: error.message })
        }
    }

    /* ------------------------------------------------ */
    /* ACTIVATE SELLER PAYMENT */
    /* ------------------------------------------------ */
    activate_payment_account = async (req, res) => {

        const { id } = req

        try {

            await sellerModel.findByIdAndUpdate(id, {
                payment: 'active'
            })

            responseReturn(res, 200, { message: 'Payment activated' })

        } catch (error) {
            responseReturn(res, 500, { message: 'Activation failed' })
        }
    }

    /* ------------------------------------------------ */
    /* GET SELLER WALLET DETAILS */
    /* ------------------------------------------------ */
    get_seller_payment_details = async (req, res) => {

        const { sellerId } = req.params

        try {

            const payments = await sellerWallet.find({ sellerId })

            const pendingWithdraws = await withdrowRequest.find({
                sellerId,
                status: 'pending'
            })

            const successWithdraws = await withdrowRequest.find({
                sellerId,
                status: 'success'
            })

            const totalAmount = payments.reduce((a, b) => a + b.amount, 0)
            const pendingAmount = pendingWithdraws.reduce((a, b) => a + b.amount, 0)
            const withdrawAmount = successWithdraws.reduce((a, b) => a + b.amount, 0)

            const availableAmount =
                totalAmount - (pendingAmount + withdrawAmount)

            responseReturn(res, 200, {
                totalAmount,
                pendingAmount,
                withdrawAmount,
                availableAmount,
                successWithdraws,
                pendingWithdraws
            })

        } catch (error) {
            responseReturn(res, 500, { message: 'Internal server error' })
        }
    }

    /* ------------------------------------------------ */
    /* SELLER WITHDRAW REQUEST */
    /* ------------------------------------------------ */
    withdraw_request = async (req, res) => {

        const { amount, sellerId } = req.body

        try {

            const request = await withdrowRequest.create({
                sellerId,
                amount: parseInt(amount),
                status: 'pending'
            })

            responseReturn(res, 200, {
                request,
                message: 'Withdraw request submitted'
            })

        } catch (error) {
            responseReturn(res, 500, { message: 'Withdraw failed' })
        }
    }

    /* ------------------------------------------------ */
    /* ADMIN GET PENDING REQUESTS */
    /* ------------------------------------------------ */
    get_payment_requests = async (req, res) => {

        try {

            const requests = await withdrowRequest.find({ status: 'pending' })

            responseReturn(res, 200, { requests })

        } catch (error) {
            responseReturn(res, 500, { message: 'Internal server error' })
        }
    }

    /* ------------------------------------------------ */
    /* ADMIN CONFIRM WITHDRAW (TRANSFER TO SELLER) */
    /* ------------------------------------------------ */
    payment_request_confirm = async (req, res) => {

        const { paymentId } = req.body

        try {

            const payment = await withdrowRequest.findById(paymentId)

            if (!payment) {
                return responseReturn(res, 404, { message: 'Request not found' })
            }

            const sellerAccount = await paymentAccountModel.findOne({
                sellerId: new ObjectId(payment.sellerId)
            })

            if (!sellerAccount) {
                return responseReturn(res, 404, { message: 'Seller account not found' })
            }

            await razorpay.transfers.create({
                account: sellerAccount.razorpayAccountId,
                amount: payment.amount * 100,
                currency: "INR",
                notes: { reason: "Seller withdrawal" }
            })

            await withdrowRequest.findByIdAndUpdate(paymentId, {
                status: 'success'
            })

            responseReturn(res, 200, {
                message: 'Withdrawal successful'
            })

        } catch (error) {
            console.log(error)
            responseReturn(res, 500, { message: 'Transfer failed' })
        }
    }

}

module.exports = new paymentController()
