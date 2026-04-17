const authorOrder = require('../../models/authOrder')
const customerOrder = require('../../models/customerOrder')
const sellerModel = require('../../models/sellerModel')

const adminSellerMessage = require('../../models/chat/adminSellerMessage')
const sellerCustomerMessage = require('../../models/chat/sellerCustomerMessage')
const productModel = require('../../models/productModel')

const { mongo: { ObjectId } } = require('mongoose')
const { responseReturn } = require('../../utiles/response')
const {
    enrichCustomerOrder,
    enrichSellerOrder,
    isFinanciallyActiveOrder,
    isPaidOnlineOrder,
    isCodOrder,
    isOnlineOrder
} = require('../../utiles/orderFinancials')

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

const sumBy = (items = [], selector) => items.reduce((total, item) => total + Number(selector(item) || 0), 0)

const sumFinancialField = (orders = [], field) => sumBy(
    orders,
    (order) => order?.financials?.[field] ?? order?.[field] ?? 0
)

const getShippingRetainedByPlatform = (orders = []) => sumBy(orders, (order) => {
    const adminEarning = Number(order?.financials?.admin_earning || 0)
    const commissionAmount = Number(order?.financials?.commission_amount || 0)
    const retainedShipping = adminEarning - commissionAmount

    return retainedShipping > 0 ? retainedShipping : 0
})

module.exports.get_seller_dashboard_data = async (req, res) => {
    const { id } = req

    try {
        const sellerOrderFilter = getSellerOrderFilter(id)

        const [
            allSellerOrders,
            totalProduct,
            totalOrder,
            totalPendingOrder,
            messages,
            recentOrders
        ] = await Promise.all([
            authorOrder.find(sellerOrderFilter),
            productModel.find({
                sellerId: new ObjectId(id)
            }).countDocuments(),
            authorOrder.countDocuments(sellerOrderFilter),
            authorOrder.countDocuments({
                ...sellerOrderFilter,
                delivery_status: { $in: ['PENDING', 'pending'] }
            }),
            sellerCustomerMessage.find({
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
            }).limit(3),
            authorOrder.find(sellerOrderFilter)
                .sort({ createdAt: -1 })
                .limit(5)
        ])

        const normalizedOrders = allSellerOrders.map((order) => enrichSellerOrder(order))
        const activeOrders = normalizedOrders.filter((order) => isFinanciallyActiveOrder(order))

        const totalSale = sumFinancialField(activeOrders, 'final_total')
        const totalProductValue = sumFinancialField(activeOrders, 'product_total')
        const totalDiscount = sumFinancialField(activeOrders, 'discount')
        const totalShipping = sumFinancialField(activeOrders, 'shipping_fee')
        const totalCommission = sumFinancialField(activeOrders, 'commission_amount')
        const netEarnings = sumFinancialField(activeOrders, 'seller_earning')
        const paidRevenue = sumFinancialField(activeOrders.filter((order) => isPaidOnlineOrder(order)), 'final_total')
        const cashPendingRevenue = sumFinancialField(activeOrders.filter((order) => isCodOrder(order)), 'final_total')
        const codOrdersCount = activeOrders.filter((order) => isCodOrder(order)).length
        const onlineOrdersCount = activeOrders.filter((order) => isOnlineOrder(order)).length

        responseReturn(res, 200, {
            totalOrder,
            totalSale,
            totalPendingOrder,
            totalProduct,
            totalProductValue,
            totalDiscount,
            totalShipping,
            totalCommission,
            netEarnings,
            paidRevenue,
            cashPendingRevenue,
            codOrdersCount,
            onlineOrdersCount,
            messages,
            recentOrders: recentOrders.map((order) => enrichSellerOrder(order))
        })
    } catch (error) {
        console.log('get seller dashboard data error ' + error.message)
        responseReturn(res, 500, { message: 'We could not load the seller dashboard. Please try again.' })
    }
}

module.exports.get_admin_dashboard_data = async (req, res) => {
    try {
        const [
            allCustomerOrders,
            totalProduct,
            totalOrder,
            totalSeller,
            messages,
            recentOrders
        ] = await Promise.all([
            customerOrder.find({}),
            productModel.find({}).countDocuments(),
            customerOrder.countDocuments(),
            sellerModel.countDocuments(),
            adminSellerMessage.find({}).limit(3),
            customerOrder.find({})
                .sort({ createdAt: -1 })
                .limit(5)
        ])

        const normalizedOrders = allCustomerOrders.map((order) => enrichCustomerOrder(order))
        const activeOrders = normalizedOrders.filter((order) => isFinanciallyActiveOrder(order))

        const totalSale = sumFinancialField(activeOrders, 'final_total')
        const totalProductValue = sumFinancialField(activeOrders, 'product_total')
        const totalDiscount = sumFinancialField(activeOrders, 'discount')
        const totalShippingCollected = sumFinancialField(activeOrders, 'shipping_fee')
        const totalCommissionEarned = sumFinancialField(activeOrders, 'commission_amount')
        const totalAdminRevenue = sumFinancialField(activeOrders, 'admin_earning')
        const totalShippingRetained = getShippingRetainedByPlatform(activeOrders)
        const totalShippingPassedToSeller = Math.max(totalShippingCollected - totalShippingRetained, 0)
        const paidRevenue = sumFinancialField(activeOrders.filter((order) => isPaidOnlineOrder(order)), 'final_total')
        const cashPendingRevenue = sumFinancialField(activeOrders.filter((order) => isCodOrder(order)), 'final_total')
        const codOrdersCount = activeOrders.filter((order) => isCodOrder(order)).length
        const onlineOrdersCount = activeOrders.filter((order) => isOnlineOrder(order)).length

        responseReturn(res, 200, {
            totalOrder,
            totalSale,
            totalSeller,
            totalProduct,
            totalProductValue,
            totalDiscount,
            totalShippingCollected,
            totalShippingRetained,
            totalShippingPassedToSeller,
            totalCommissionEarned,
            totalAdminRevenue,
            paidRevenue,
            cashPendingRevenue,
            codOrdersCount,
            onlineOrdersCount,
            messages,
            recentOrders: recentOrders.map((order) => enrichCustomerOrder(order))
        })

    } catch (error) {
        console.log('get admin dashboard data error ' + error.message)
        responseReturn(res, 500, { message: 'We could not load the admin dashboard. Please try again.' })
    }

}
