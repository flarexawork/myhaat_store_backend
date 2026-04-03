const hasValue = (value) => value !== undefined && value !== null

const toPlainObject = (value = {}) => {
    if (value && typeof value.toObject === 'function') {
        return value.toObject()
    }

    return { ...value }
}

const normalizeMoney = (value) => {
    const amount = Number(value)
    return Number.isFinite(amount) ? amount : 0
}

const normalizePositiveMoney = (value) => {
    const amount = normalizeMoney(value)
    return amount > 0 ? amount : 0
}

const normalizePercent = (value) => {
    const percent = normalizeMoney(value)

    if (percent <= 0) {
        return 0
    }

    return percent > 100 ? 100 : percent
}

const normalizeQuantity = (value) => {
    const quantity = Number(value)
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

const getDiscountedUnitPrice = (product = {}) => {
    const basePrice = normalizePositiveMoney(product.price)
    const discountPercent = normalizePercent(product.discount)

    if (!discountPercent) {
        return basePrice
    }

    const discountAmount = Math.floor((basePrice * discountPercent) / 100)
    return Math.max(basePrice - discountAmount, 0)
}

const calculateProductLinesSummary = (products = []) => {
    const safeProducts = Array.isArray(products) ? products : []

    return safeProducts.reduce((summary, item) => {
        const productInfo = item?.productInfo || item || {}
        const quantity = normalizeQuantity(item?.quantity ?? productInfo?.quantity)

        if (!quantity) {
            return summary
        }

        const baseUnitPrice = normalizePositiveMoney(productInfo.price)
        const discountedUnitPrice = getDiscountedUnitPrice(productInfo)
        const subtotal = baseUnitPrice * quantity
        const productTotal = discountedUnitPrice * quantity

        summary.quantity += quantity
        summary.subtotal += subtotal
        summary.product_total += productTotal
        summary.discount += Math.max(subtotal - productTotal, 0)

        return summary
    }, {
        quantity: 0,
        subtotal: 0,
        product_total: 0,
        discount: 0
    })
}

const calculateCommissionAmount = (productTotal, commissionPercent) => {
    const normalizedProductTotal = normalizePositiveMoney(productTotal)
    const normalizedCommissionPercent = normalizePercent(commissionPercent)

    if (!normalizedProductTotal || !normalizedCommissionPercent) {
        return 0
    }

    return Math.round((normalizedProductTotal * normalizedCommissionPercent) / 100)
}

const resolveOrderShippingFee = (order, productTotal) => {
    const storedShippingFee = normalizePositiveMoney(order?.shipping_fee)

    if (storedShippingFee) {
        return storedShippingFee
    }

    const finalTotal = normalizePositiveMoney(order?.price)

    if (finalTotal > productTotal) {
        return finalTotal - productTotal
    }

    return 0
}

const normalizePaymentType = (order = {}) => {
    const rawType = String(order?.payment_type || '').trim().toLowerCase()

    if (rawType === 'cod' || rawType === 'online') {
        return rawType
    }

    const rawStatus = String(order?.payment_status || '').trim().toLowerCase()
    return rawStatus === 'cod' ? 'cod' : 'online'
}

const isCancelledOrRejected = (order = {}) => {
    const deliveryStatus = String(order?.delivery_status || '').trim().toLowerCase()
    const orderStatus = String(order?.order_status || '').trim().toUpperCase()

    return deliveryStatus === 'cancelled' || deliveryStatus === 'delivery_rejected' || orderStatus === 'REJECT'
}

const calculateCheckoutOrderSummary = ({
    sellerGroups = [],
    commissionPercent = 0,
    shippingFeePerGroup = 0
}) => {
    const safeSellerGroups = Array.isArray(sellerGroups) ? sellerGroups : []
    const normalizedCommissionPercent = normalizePercent(commissionPercent)
    const normalizedShippingFeePerGroup = normalizePositiveMoney(shippingFeePerGroup)

    const seller_summaries = safeSellerGroups.map((group = {}) => {
        const productSummary = calculateProductLinesSummary(group.products)
        const fallbackProductTotal = normalizePositiveMoney(group.price)
        const product_total = productSummary.product_total || fallbackProductTotal
        const subtotal = productSummary.subtotal || product_total
        const discount = Math.max(subtotal - product_total, 0)
        const shipping_fee = normalizedShippingFeePerGroup
        const commission_amount = calculateCommissionAmount(product_total, normalizedCommissionPercent)
        const final_total = product_total + shipping_fee
        const seller_earning = Math.max(product_total - commission_amount + shipping_fee, 0)
        const admin_earning = Math.max(final_total - seller_earning, 0)

        return {
            sellerId: group?.sellerId,
            shopName: group?.shopName,
            quantity: productSummary.quantity,
            subtotal,
            discount,
            product_total,
            shipping_fee,
            commission_percent: normalizedCommissionPercent,
            commission_amount,
            tax: 0,
            final_total,
            seller_earning,
            admin_earning,
            products: Array.isArray(group?.products) ? group.products : []
        }
    })

    return seller_summaries.reduce((summary, sellerSummary) => {
        summary.quantity += sellerSummary.quantity
        summary.subtotal += sellerSummary.subtotal
        summary.discount += sellerSummary.discount
        summary.product_total += sellerSummary.product_total
        summary.shipping_fee += sellerSummary.shipping_fee
        summary.commission_amount += sellerSummary.commission_amount
        summary.tax += sellerSummary.tax
        summary.final_total += sellerSummary.final_total
        summary.seller_earning += sellerSummary.seller_earning
        summary.admin_earning += sellerSummary.admin_earning
        summary.seller_summaries.push(sellerSummary)

        return summary
    }, {
        quantity: 0,
        subtotal: 0,
        discount: 0,
        product_total: 0,
        shipping_fee: 0,
        commission_percent: normalizedCommissionPercent,
        commission_amount: 0,
        tax: 0,
        final_total: 0,
        seller_earning: 0,
        admin_earning: 0,
        seller_summaries: []
    })
}

const calculateOrderSummary = (order = {}, options = {}) => {
    const plainOrder = toPlainObject(order)
    const productSummary = calculateProductLinesSummary(plainOrder.products)
    const fallbackProductTotal = normalizePositiveMoney(options?.product_total)
    const product_total = normalizePositiveMoney(plainOrder.product_total) || productSummary.product_total || fallbackProductTotal
    const subtotal = productSummary.subtotal || product_total
    const discount = Math.max(subtotal - product_total, 0)
    const shipping_fee = resolveOrderShippingFee(plainOrder, product_total)
    const final_total = normalizePositiveMoney(plainOrder.price) || product_total + shipping_fee
    const commission_percent = hasValue(plainOrder.commission_percent)
        ? normalizePercent(plainOrder.commission_percent)
        : normalizePercent(options?.commissionPercent)
    const commission_amount = hasValue(plainOrder.commission_amount)
        ? normalizePositiveMoney(plainOrder.commission_amount)
        : calculateCommissionAmount(product_total, commission_percent)
    const seller_earning = hasValue(plainOrder.seller_earning)
        ? normalizeMoney(plainOrder.seller_earning)
        : Math.max(product_total - commission_amount + shipping_fee, 0)
    const admin_earning = Math.max(final_total - seller_earning, 0)

    return {
        quantity: productSummary.quantity,
        subtotal,
        discount,
        product_total,
        shipping_fee,
        commission_percent,
        commission_amount,
        tax: 0,
        final_total,
        seller_earning,
        admin_earning,
        payment_type: normalizePaymentType(plainOrder),
        payment_status: plainOrder.payment_status || 'pending'
    }
}

const calculateSellerOrderSummary = (order = {}, options = {}) => {
    const plainOrder = toPlainObject(order)
    const productSummary = calculateProductLinesSummary(plainOrder.products)
    const fallbackProductTotal = normalizePositiveMoney(options?.product_total)
    const product_total = normalizePositiveMoney(plainOrder.price) || productSummary.product_total || fallbackProductTotal
    const subtotal = productSummary.subtotal || product_total
    const discount = Math.max(subtotal - product_total, 0)
    const shipping_fee = normalizePositiveMoney(plainOrder.shipping_fee)
    const final_total = product_total + shipping_fee
    const commission_percent = hasValue(plainOrder.commission_percent)
        ? normalizePercent(plainOrder.commission_percent)
        : normalizePercent(options?.commissionPercent)
    const commission_amount = hasValue(plainOrder.commission_amount)
        ? normalizePositiveMoney(plainOrder.commission_amount)
        : calculateCommissionAmount(product_total, commission_percent)
    const seller_earning = hasValue(plainOrder.seller_earning)
        ? normalizeMoney(plainOrder.seller_earning)
        : Math.max(product_total - commission_amount + shipping_fee, 0)
    const admin_earning = Math.max(final_total - seller_earning, 0)

    return {
        quantity: productSummary.quantity,
        subtotal,
        discount,
        product_total,
        shipping_fee,
        commission_percent,
        commission_amount,
        tax: 0,
        final_total,
        seller_earning,
        admin_earning,
        payment_type: normalizePaymentType(plainOrder),
        payment_status: plainOrder.payment_status || 'pending'
    }
}

const enrichCustomerOrder = (order = {}, options = {}) => {
    const plainOrder = toPlainObject(order)
    const financials = calculateOrderSummary(plainOrder, options)

    return {
        ...plainOrder,
        shipping_fee: financials.shipping_fee,
        commission_percent: financials.commission_percent,
        commission_amount: financials.commission_amount,
        seller_earning: financials.seller_earning,
        subtotal: financials.subtotal,
        discount_amount: financials.discount,
        tax_amount: financials.tax,
        final_total: financials.final_total,
        admin_earning: financials.admin_earning,
        payment_type: financials.payment_type,
        financials
    }
}

const enrichSellerOrder = (order = {}, options = {}) => {
    const plainOrder = toPlainObject(order)
    const financials = calculateSellerOrderSummary(plainOrder, options)

    return {
        ...plainOrder,
        product_total: financials.product_total,
        shipping_fee: financials.shipping_fee,
        commission_percent: financials.commission_percent,
        commission_amount: financials.commission_amount,
        seller_earning: financials.seller_earning,
        subtotal: financials.subtotal,
        discount_amount: financials.discount,
        tax_amount: financials.tax,
        final_total: financials.final_total,
        admin_earning: financials.admin_earning,
        payment_type: financials.payment_type,
        financials
    }
}

const enrichCustomerOrderWithSuborders = (order = {}, options = {}) => {
    const enrichedOrder = enrichCustomerOrder(order, options)
    const suborder = Array.isArray(enrichedOrder?.suborder)
        ? enrichedOrder.suborder.map((item) => enrichSellerOrder(item, options))
        : []

    return {
        ...enrichedOrder,
        suborder
    }
}

const isFinanciallyActiveOrder = (order = {}) => !isCancelledOrRejected(order)

const isPaidOnlineOrder = (order = {}) => {
    if (!isFinanciallyActiveOrder(order)) {
        return false
    }

    return normalizePaymentType(order) === 'online' && String(order?.payment_status || '').trim().toLowerCase() === 'paid'
}

const isCodOrder = (order = {}) => {
    if (!isFinanciallyActiveOrder(order)) {
        return false
    }

    return normalizePaymentType(order) === 'cod'
}

const isOnlineOrder = (order = {}) => {
    if (!isFinanciallyActiveOrder(order)) {
        return false
    }

    return normalizePaymentType(order) === 'online'
}

module.exports = {
    normalizeMoney,
    normalizePositiveMoney,
    normalizePercent,
    getDiscountedUnitPrice,
    calculateCommissionAmount,
    calculateCheckoutOrderSummary,
    calculateOrderSummary,
    calculateSellerOrderSummary,
    enrichCustomerOrder,
    enrichSellerOrder,
    enrichCustomerOrderWithSuborders,
    normalizePaymentType,
    isFinanciallyActiveOrder,
    isPaidOnlineOrder,
    isCodOrder,
    isOnlineOrder
}
