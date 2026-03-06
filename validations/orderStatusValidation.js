const ORDER_STATUS_VALUES = ['ACCEPT', 'REJECT']
const DELIVERY_STATUS_FLOW = [
    'PENDING',
    'PROCESSING',
    'PACKED',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'DELIVERY_REJECTED',
    'cancelled'
]

const DELIVERY_STATUS_TRANSITIONS = {
    PENDING: ['PROCESSING'],
    PROCESSING: ['PACKED'],
    PACKED: ['SHIPPED'],
    SHIPPED: ['OUT_FOR_DELIVERY'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_REJECTED'],
    DELIVERED: [],
    DELIVERY_REJECTED: [],
    cancelled: []
}

const DELIVERY_STATUS_RANK = {
    PENDING: 1,
    PROCESSING: 2,
    PACKED: 3,
    SHIPPED: 4,
    OUT_FOR_DELIVERY: 5,
    DELIVERY_REJECTED: 5,
    DELIVERED: 6,
    cancelled: 0
}

const LEGACY_DELIVERY_MAP = {
    pending: 'PENDING',
    processing: 'PROCESSING',
    packed: 'PACKED',
    shipped: 'SHIPPED',
    out_for_delivery: 'OUT_FOR_DELIVERY',
    outfordelivery: 'OUT_FOR_DELIVERY',
    delivered: 'DELIVERED',
    delivery_rejected: 'DELIVERY_REJECTED',
    deliveryrejected: 'DELIVERY_REJECTED',
    not_accepted: 'DELIVERY_REJECTED',
    client_not_accepted: 'DELIVERY_REJECTED',
    cancelled: 'cancelled',
    canceled: 'cancelled'
}

const isStatusUpdaterRole = (role) => role === 'seller' || role === 'admin'

const normalizeOrderStatus = (status = '') => String(status).trim().toUpperCase()

const normalizeDeliveryStatus = (status = '') => {
    const raw = String(status).trim()
    if (!raw) return ''

    const key = raw.toLowerCase().replace(/[\s-]+/g, '_')

    if (LEGACY_DELIVERY_MAP[key]) {
        return LEGACY_DELIVERY_MAP[key]
    }

    return raw.toUpperCase()
}

const isValidOrderStatus = (status) => ORDER_STATUS_VALUES.includes(status)

const isValidDeliveryStatus = (status) => DELIVERY_STATUS_FLOW.includes(status)

const getDeliveryStatusIndex = (status) => DELIVERY_STATUS_FLOW.indexOf(status)

const getDeliveryStatusRank = (status) => DELIVERY_STATUS_RANK[status] ?? Number.MAX_SAFE_INTEGER

const isAllowedDeliveryTransition = (currentStatus, nextStatus) => {
    const allowedNext = DELIVERY_STATUS_TRANSITIONS[currentStatus] || []
    return allowedNext.includes(nextStatus)
}

module.exports = {
    ORDER_STATUS_VALUES,
    DELIVERY_STATUS_FLOW,
    DELIVERY_STATUS_TRANSITIONS,
    isStatusUpdaterRole,
    normalizeOrderStatus,
    normalizeDeliveryStatus,
    isValidOrderStatus,
    isValidDeliveryStatus,
    getDeliveryStatusIndex,
    getDeliveryStatusRank,
    isAllowedDeliveryTransition
}
