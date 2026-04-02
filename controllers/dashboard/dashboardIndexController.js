const authorOrder = require('../../models/authOrder')
const customerOrder = require('../../models/customerOrder')
const sellerModel = require('../../models/sellerModel')

const adminSellerMessage = require('../../models/chat/adminSellerMessage')
const sellerCustomerMessage = require('../../models/chat/sellerCustomerMessage')
const productModel = require('../../models/productModel')

const { mongo: { ObjectId } } = require('mongoose')
const { responseReturn } = require('../../utiles/response')

const SALE_PAYMENT_STATUSES = ['paid', 'cod']
const EXCLUDED_DELIVERY_STATUSES = ['cancelled', 'DELIVERY_REJECTED', 'delivery_rejected']

const getSellerOrderFilter = (sellerId) => {
    if (ObjectId.isValid(sellerId)) {
        return {
            $or: [
                { sellerId: new ObjectId(sellerId) },
                { sellerId }
            ]
        }
    }

    return { sellerId }
}

const getValidSaleMatch = (baseMatch = {}) => ({
    ...baseMatch,
    payment_status: { $in: SALE_PAYMENT_STATUSES },
    delivery_status: { $nin: EXCLUDED_DELIVERY_STATUSES },
    order_status: { $ne: 'REJECT' }
})

const getAggregateTotal = async (model, match, amountField = 'price') => {
    const totalAgg = await model.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalAmount: { $sum: `$${amountField}` }
            }
        }
    ])

    return Number(totalAgg[0]?.totalAmount) || 0
}

module.exports.get_seller_dashboard_data = async (req, res) => {
    const { id } = req;

    try {
        const sellerOrderFilter = getSellerOrderFilter(id)

        const totalSale = await getAggregateTotal(
            authorOrder,
            getValidSaleMatch(sellerOrderFilter)
        )

        const totalProduct = await productModel.find({
            sellerId: new ObjectId(id)
        }).countDocuments()

        const totalOrder = await authorOrder.countDocuments(sellerOrderFilter)

        const totalPendingOrder = await authorOrder.countDocuments({
            ...sellerOrderFilter,
            delivery_status: { $in: ['PENDING', 'pending'] }
        })

        const messages = await sellerCustomerMessage.find({
            $or: [
                {
                    senderId: {
                        $eq: id
                    }
                },
                {
                    receverId: {
                        $eq: id
                    }
                }
            ]
        }).limit(3)

        const recentOrders = await authorOrder.find(sellerOrderFilter)
            .sort({ createdAt: -1 })
            .limit(5)

        responseReturn(res, 200, {
            totalOrder,
            totalSale,
            totalPendingOrder,
            messages,
            recentOrders,
            totalProduct
        })
    } catch (error) {
        console.log('get seller dashboard data error ' + error.message)
        responseReturn(res, 500, { message: 'Failed to load seller dashboard data' })
    }
}

module.exports.get_admin_dashboard_data = async (req, res) => {
    try {
        const totalSale = await getAggregateTotal(
            customerOrder,
            getValidSaleMatch()
        )

        const totalProduct = await productModel.find({}).countDocuments()

        const totalOrder = await customerOrder.find({}).countDocuments()

        const totalSeller = await sellerModel.find({}).countDocuments()

        const messages = await adminSellerMessage.find({}).limit(3)

        const recentOrders = await customerOrder.find({})
            .sort({ createdAt: -1 })
            .limit(5)

        responseReturn(res, 200, {
            totalOrder,
            totalSale,
            totalSeller,
            messages,
            recentOrders,
            totalProduct
        })

    } catch (error) {
        console.log('get admin dashboard data error ' + error.message)
        responseReturn(res, 500, { message: 'Failed to load admin dashboard data' })
    }

}
