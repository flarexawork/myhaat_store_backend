const authOrderModel = require('../../models/authOrder')
const customerOrder = require('../../models/customerOrder')
const {
    normalizeDeliveryStatus,
    normalizeOrderStatus
} = require('../../validations/orderStatusValidation')

const parsePositiveInteger = (value, fallback) => {
    const parsedValue = Number(value)

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        return fallback
    }

    return Math.floor(parsedValue)
}

const AUTO_CANCEL_WINDOW_SECONDS = parsePositiveInteger(
    process.env.AUTO_ORDER_CANCEL_SECONDS,
    600
)
const AUTO_CANCEL_WINDOW_MS = AUTO_CANCEL_WINDOW_SECONDS * 1000
const AUTO_CANCEL_SWEEP_INTERVAL_MS = parsePositiveInteger(
    process.env.AUTO_ORDER_CANCEL_SWEEP_MS,
    1000
)
const AUTO_CANCEL_BATCH_SIZE = parsePositiveInteger(
    process.env.AUTO_ORDER_CANCEL_BATCH_SIZE,
    50
)

const AUTO_CANCELABLE_PAYMENT_STATUSES = ['pending', 'failed']
const AUTO_CANCELABLE_DELIVERY_STATUSES = ['PENDING', 'pending']

let workerInterval = null
let isSweepInProgress = false

const normalizeReferenceTime = (referenceTime = new Date()) => {
    const resolvedTime = referenceTime instanceof Date
        ? referenceTime
        : new Date(referenceTime)

    if (Number.isNaN(resolvedTime.getTime())) {
        return new Date()
    }

    return resolvedTime
}

const normalizePaymentStatus = (paymentStatus = '') =>
    String(paymentStatus).trim().toLowerCase()

const normalizePaymentType = (paymentType = '') =>
    String(paymentType).trim().toLowerCase()

const getOrderAutoCancelDeadline = (order = {}) => {
    const createdAt = new Date(order?.createdAt)

    if (Number.isNaN(createdAt.getTime())) {
        return null
    }

    return new Date(createdAt.getTime() + AUTO_CANCEL_WINDOW_MS)
}

const isOrderEligibleForAutoCancel = (order = {}) => {
    const paymentType = normalizePaymentType(order?.payment_type)
    const paymentStatus = normalizePaymentStatus(order?.payment_status)
    const orderStatus = normalizeOrderStatus(order?.order_status || 'PENDING')
    const deliveryStatus = normalizeDeliveryStatus(order?.delivery_status || 'PENDING')

    return (
        paymentType === 'online' &&
        AUTO_CANCELABLE_PAYMENT_STATUSES.includes(paymentStatus) &&
        orderStatus === 'PENDING' &&
        deliveryStatus === 'PENDING'
    )
}

const getOrderAutoCancelState = (order = {}, referenceTime = new Date()) => {
    const resolvedReferenceTime = normalizeReferenceTime(referenceTime)
    const deadlineAt = getOrderAutoCancelDeadline(order)
    const enabled = isOrderEligibleForAutoCancel(order)
    const remainingMs = enabled && deadlineAt
        ? Math.max(deadlineAt.getTime() - resolvedReferenceTime.getTime(), 0)
        : 0

    return {
        enabled,
        windowMs: AUTO_CANCEL_WINDOW_MS,
        deadlineAt: deadlineAt ? deadlineAt.toISOString() : null,
        remainingMs,
        expired: enabled && remainingMs === 0
    }
}

const buildExpiredOrderFilter = (referenceTime = new Date()) => {
    const resolvedReferenceTime = normalizeReferenceTime(referenceTime)

    return {
        payment_type: 'online',
        payment_status: { $in: AUTO_CANCELABLE_PAYMENT_STATUSES },
        order_status: 'PENDING',
        delivery_status: { $in: AUTO_CANCELABLE_DELIVERY_STATUSES },
        createdAt: {
            $lte: new Date(resolvedReferenceTime.getTime() - AUTO_CANCEL_WINDOW_MS)
        }
    }
}

const applyAutoCancellationToOrder = async (orderId, referenceTime = new Date()) => {
    const filter = {
        _id: orderId,
        ...buildExpiredOrderFilter(referenceTime)
    }

    const parentUpdateResult = await customerOrder.updateOne(filter, {
        $set: {
            order_status: 'REJECT',
            delivery_status: 'cancelled'
        }
    })

    if (!parentUpdateResult.modifiedCount) {
        return false
    }

    await authOrderModel.updateMany(
        { orderId },
        {
            $set: {
                order_status: 'REJECT',
                delivery_status: 'cancelled'
            }
        }
    )

    return true
}

const cancelExpiredOrderById = async (orderId, referenceTime = new Date()) => {
    if (!orderId) {
        return false
    }

    return applyAutoCancellationToOrder(orderId, referenceTime)
}

const cancelExpiredOrdersByIds = async (orderIds = [], referenceTime = new Date()) => {
    const uniqueOrderIds = Array.from(
        new Set(
            (Array.isArray(orderIds) ? orderIds : [])
                .filter(Boolean)
                .map((orderId) => String(orderId))
        )
    )

    let cancelledCount = 0

    for (let index = 0; index < uniqueOrderIds.length; index++) {
        const wasCancelled = await applyAutoCancellationToOrder(
            uniqueOrderIds[index],
            referenceTime
        )

        if (wasCancelled) {
            cancelledCount += 1
        }
    }

    return cancelledCount
}

const reconcileOrdersAutoCancellation = async (orders = [], referenceTime = new Date()) => {
    const resolvedReferenceTime = normalizeReferenceTime(referenceTime)
    const normalizedOrders = Array.isArray(orders) ? orders : [orders]
    const expiredOrderIds = normalizedOrders
        .filter((order) => getOrderAutoCancelState(order, resolvedReferenceTime).expired)
        .map((order) => order?._id)

    if (!expiredOrderIds.length) {
        return 0
    }

    return cancelExpiredOrdersByIds(expiredOrderIds, resolvedReferenceTime)
}

const sweepExpiredOrders = async () => {
    if (isSweepInProgress) {
        return { cancelledCount: 0, skipped: true }
    }

    isSweepInProgress = true

    try {
        const referenceTime = new Date()
        const dueOrders = await customerOrder.find(
            buildExpiredOrderFilter(referenceTime)
        )
            .sort({ createdAt: 1 })
            .limit(AUTO_CANCEL_BATCH_SIZE)
            .select('_id')

        let cancelledCount = 0

        for (let index = 0; index < dueOrders.length; index++) {
            const wasCancelled = await applyAutoCancellationToOrder(
                dueOrders[index]._id,
                referenceTime
            )

            if (wasCancelled) {
                cancelledCount += 1
            }
        }

        return { cancelledCount, skipped: false }
    } catch (error) {
        console.error('Auto cancel sweep error:', error)
        return { cancelledCount: 0, skipped: false }
    } finally {
        isSweepInProgress = false
    }
}

const startAutoCancelWorker = () => {
    if (workerInterval) {
        return workerInterval
    }

    void sweepExpiredOrders()

    workerInterval = setInterval(() => {
        void sweepExpiredOrders()
    }, AUTO_CANCEL_SWEEP_INTERVAL_MS)

    if (typeof workerInterval.unref === 'function') {
        workerInterval.unref()
    }

    return workerInterval
}

const stopAutoCancelWorker = () => {
    if (!workerInterval) {
        return
    }

    clearInterval(workerInterval)
    workerInterval = null
}

module.exports = {
    AUTO_CANCEL_WINDOW_SECONDS,
    AUTO_CANCEL_WINDOW_MS,
    AUTO_CANCEL_SWEEP_INTERVAL_MS,
    buildExpiredOrderFilter,
    getOrderAutoCancelDeadline,
    getOrderAutoCancelState,
    isOrderEligibleForAutoCancel,
    cancelExpiredOrderById,
    cancelExpiredOrdersByIds,
    reconcileOrdersAutoCancellation,
    sweepExpiredOrders,
    startAutoCancelWorker,
    stopAutoCancelWorker
}
