const Settings = require('../models/settingsModel')
const { responseReturn } = require('../utiles/response')

const ensureAdmin = (req, res) => {
    if (req.role !== 'admin') {
        responseReturn(res, 403, { error: 'You do not have permission to access this resource.' })
        return false
    }

    return true
}

module.exports.get_public_settings = async (req, res) => {
    try {
        const settings = await Settings.getSettings()
        responseReturn(res, 200, { settings })
    } catch (error) {
        console.error('get_public_settings error:', error.message)
        responseReturn(res, 500, { error: 'We could not load the settings. Please try again.' })
    }
}

module.exports.get_admin_settings = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) return

        const settings = await Settings.getSettings()
        responseReturn(res, 200, { settings })
    } catch (error) {
        console.error('get_admin_settings error:', error.message)
        responseReturn(res, 500, { error: 'We could not load the settings. Please try again.' })
    }
}

module.exports.update_admin_settings = async (req, res) => {
    try {
        if (!ensureAdmin(req, res)) return

        const { shipping_fee } = req.body

        if (shipping_fee === undefined || shipping_fee === null) {
            return responseReturn(res, 400, { error: 'Shipping fee is required.' })
        }

        const parsedShippingFee = Number(shipping_fee)

        if (!Number.isFinite(parsedShippingFee) || parsedShippingFee < 0) {
            return responseReturn(res, 400, { error: 'Shipping fee must be 0 or greater.' })
        }

        const updated = await Settings.updateSettings({
            shipping_fee: parsedShippingFee
        })

        responseReturn(res, 200, {
            settings: {
                shipping_fee: Number(updated.shipping_fee) || 0
            },
            message: 'Shipping settings updated successfully'
        })
    } catch (error) {
        console.error('update_admin_settings error:', error.message)
        responseReturn(res, 500, { error: 'We could not update the settings. Please try again.' })
    }
}
