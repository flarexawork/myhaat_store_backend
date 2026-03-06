const {
    ORDER_STATUS_VALUES,
    DELIVERY_STATUS_FLOW,
    isStatusUpdaterRole,
    normalizeOrderStatus,
    normalizeDeliveryStatus,
    isValidOrderStatus,
    getDeliveryStatusRank,
    isValidDeliveryStatus,
    isAllowedDeliveryTransition
} = require('../../validations/orderStatusValidation')

class OrderStatusService {
    ensureRole(role) {
        if (!isStatusUpdaterRole(role)) {
            return {
                success: false,
                code: 401,
                message: 'unauthorized'
            }
        }

        return { success: true }
    }

    validateOrderStatusUpdate(currentStatus, nextStatus) {
        const normalizedStatus = normalizeOrderStatus(nextStatus)
        const normalizedCurrent = normalizeOrderStatus(currentStatus)

        if (!isValidOrderStatus(normalizedStatus)) {
            return {
                success: false,
                code: 400,
                message: 'Invalid status transition'
            }
        }

        if (isValidOrderStatus(normalizedCurrent)) {
            return {
                success: false,
                code: 400,
                message: 'Order status already finalized'
            }
        }

        return {
            success: true,
            data: { order_status: normalizedStatus }
        }
    }

    validateDeliveryStatusUpdate(currentStatus, nextStatus, orderStatus) {
        const normalizedCurrent = normalizeDeliveryStatus(currentStatus || 'PENDING')
        const normalizedNext = normalizeDeliveryStatus(nextStatus)
        const normalizedOrderStatus = normalizeOrderStatus(orderStatus)

        if (!isValidDeliveryStatus(normalizedNext) || !isValidDeliveryStatus(normalizedCurrent)) {
            return {
                success: false,
                code: 400,
                message: 'Invalid status transition'
            }
        }

        if (normalizedOrderStatus === 'REJECT') {
            return {
                success: false,
                code: 400,
                message: 'Invalid status transition'
            }
        }

        if (normalizedOrderStatus !== 'ACCEPT') {
            return {
                success: false,
                code: 400,
                message: 'Invalid status transition'
            }
        }

        if (!isAllowedDeliveryTransition(normalizedCurrent, normalizedNext)) {
            return {
                success: false,
                code: 400,
                message: 'Invalid delivery status transition'
            }
        }

        return {
            success: true,
            data: { delivery_status: normalizedNext }
        }
    }

    getDeliveryStatusAggregation(statuses) {
        if (!statuses.length) {
            return 'PENDING'
        }

        const normalized = statuses
            .map((status) => normalizeDeliveryStatus(status))
            .filter((status) => isValidDeliveryStatus(status))

        if (!normalized.length) {
            return 'PENDING'
        }

        if (normalized.every((status) => status === normalized[0])) {
            return normalized[0]
        }

        if (normalized.includes('cancelled')) {
            return 'cancelled'
        }

        if (normalized.includes('DELIVERY_REJECTED')) {
            return 'DELIVERY_REJECTED'
        }

        // The parent order should represent the least advanced sub-order stage.
        let minRank = Number.MAX_SAFE_INTEGER
        let selectedStatus = 'PENDING'
        for (let i = 0; i < normalized.length; i++) {
            const rank = getDeliveryStatusRank(normalized[i])
            if (rank < minRank) {
                minRank = rank
                selectedStatus = normalized[i]
            }
        }

        return selectedStatus || 'PENDING'
    }

    getOrderStatusAggregation(statuses) {
        if (!statuses.length) {
            return null
        }

        const normalized = statuses
            .map((status) => normalizeOrderStatus(status))
            .filter((status) => isValidOrderStatus(status))

        if (normalized.length !== statuses.length) {
            return null
        }

        if (normalized.every((status) => status === normalized[0])) {
            return normalized[0]
        }

        return null
    }

    isOwnerOrAdmin(role, currentUserId, orderSellerId) {
        if (role === 'admin') {
            return true
        }

        return String(currentUserId) === String(orderSellerId)
    }
}

module.exports = new OrderStatusService()
