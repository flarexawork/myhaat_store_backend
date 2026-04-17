const CommissionSettings = require('../../models/commissionSettingsModel')
const { responseReturn } = require('../../utiles/response')

module.exports.get_commission_settings = async (req, res) => {
    try {
        const settings = await CommissionSettings.getSettings()
        responseReturn(res, 200, { settings })
    } catch (error) {
        console.error('get_commission_settings error:', error.message)
        responseReturn(res, 500, { error: 'We could not load the commission settings. Please try again.' })
    }
}

module.exports.update_commission_settings = async (req, res) => {
    try {
        const { commission_percent } = req.body

        if (commission_percent === undefined || commission_percent === null) {
            return responseReturn(res, 400, { error: 'Commission percentage is required.' })
        }

        const percent = Number(commission_percent)

        if (isNaN(percent) || percent < 0 || percent > 100) {
            return responseReturn(res, 400, { error: 'Commission percentage must be between 0 and 100.' })
        }

        const updated = await CommissionSettings.updateSettings({
            commission_percent: percent
        })

        responseReturn(res, 200, {
            settings: {
                commission_percent: updated.commission_percent
            },
            message: 'Commission settings updated successfully'
        })
    } catch (error) {
        console.error('update_commission_settings error:', error.message)
        responseReturn(res, 500, { error: 'We could not update the commission settings. Please try again.' })
    }
}
