const sellerModel = require('../../models/sellerModel')
const { responseReturn } = require('../../utiles/response')
const sendMail = require('../../utiles/mailer')
const {
    ACCOUNT_STATUS,
    VERIFICATION_STATUS,
    normalizeAccountStatus,
    normalizeAdminRemark,
    getEffectiveVerificationStatus,
    normalizeVerificationMedia
} = require('../../utiles/sellerVerification')

const withVerificationStatus = (seller) => {
    const sellerData = normalizeVerificationMedia(seller.toObject())
    sellerData.verificationStatus = getEffectiveVerificationStatus(seller)
    sellerData.accountStatus = normalizeAccountStatus(seller)
    sellerData.adminRemark = normalizeAdminRemark(seller)
    return sellerData
}

const sendAccountStatusMail = async (seller, accountStatus, remark = '') => {
    if (!seller?.email) {
        return
    }

    const subject = accountStatus === ACCOUNT_STATUS.ACTIVE
        ? 'Account Activated'
        : 'Account Deactivated'

    const message = accountStatus === ACCOUNT_STATUS.ACTIVE
        ? '<p>Your seller account has been activated.</p>'
        : `<p>Your seller account has been deactivated.</p><p>Remark: ${remark || 'No remark provided'}</p>`

    try {
        await sendMail({
            to: seller.email,
            subject,
            html: `<div><p>Hello ${seller.name || 'Seller'},</p>${message}</div>`
        })
        console.log('Mail sent to:', seller.email)
    } catch (error) {
        console.log('MAIL ERROR:', error.message)
    }
}

const getAccountStatusQuery = (accountStatus) => {
    if (accountStatus === ACCOUNT_STATUS.ACTIVE) {
        return {
            $or: [
                { accountStatus: ACCOUNT_STATUS.ACTIVE },
                { accountStatus: { $exists: false }, status: 'active' }
            ]
        }
    }

    return {
        $or: [
            { accountStatus: ACCOUNT_STATUS.INACTIVE },
            { accountStatus: { $exists: false }, status: 'deactive' }
        ]
    }
}

const buildSellerStatusUpdate = ({ nextAccountStatus, remark = '' }) => {
    if (nextAccountStatus === ACCOUNT_STATUS.ACTIVE) {
        return {
            status: 'active',
            accountStatus: ACCOUNT_STATUS.ACTIVE,
            verificationStatus: VERIFICATION_STATUS.APPROVED,
            adminRemark: ''
        }
    }

    return {
        status: 'deactive',
        accountStatus: ACCOUNT_STATUS.INACTIVE,
        adminRemark: remark
    }
}

class sellerController {
    
    get_seller_request = async (req, res) => {
        const { page, searchValue, parPage } = req.query
        const parsedPage = parseInt(page) || 1
        const parsedParPage = parseInt(parPage) || 10
        const skipPage = parsedParPage * (parsedPage - 1)
        const query = {
            verificationStatus: VERIFICATION_STATUS.PENDING_ADMIN
        }

        try {
            if (searchValue) {
                query.$text = { $search: searchValue }
            }

            const sellers = await sellerModel.find(query).skip(skipPage).limit(parsedParPage).sort({ createdAt: -1 })
            const totalSeller = await sellerModel.countDocuments(query)

            responseReturn(res, 200, {
                totalSeller,
                sellers: sellers.map(withVerificationStatus)
            })
        } catch (error) {
            responseReturn(res, 500, { error: error.message })
        }
    }
    get_seller = async (req, res) => {
        const { sellerId } = req.params

        try {
            const seller = await sellerModel.findById(sellerId)
            responseReturn(res, 200, { seller: seller ? withVerificationStatus(seller) : null })
        } catch (error) {
            responseReturn(res, 500, { error: error.message })
        }
    }

    seller_status_update = async (req, res) => {
        const { sellerId, status, remark = '' } = req.body
        try {
            const seller = await sellerModel.findById(sellerId)

            if (!seller) {
                return responseReturn(res, 404, { error: 'Seller not found' })
            }

            const trimmedRemark = String(remark || '').trim()
            const sellerUpdate = status === 'active'
                ? buildSellerStatusUpdate({ nextAccountStatus: ACCOUNT_STATUS.ACTIVE })
                : buildSellerStatusUpdate({ nextAccountStatus: ACCOUNT_STATUS.INACTIVE, remark: trimmedRemark })

            if (sellerUpdate.accountStatus === ACCOUNT_STATUS.INACTIVE && !trimmedRemark) {
                return responseReturn(res, 400, { error: 'Remark is required when deactivating a seller' })
            }

            await sellerModel.findByIdAndUpdate(sellerId, sellerUpdate)
            const updatedSeller = await sellerModel.findById(sellerId)

            await sendAccountStatusMail(
                updatedSeller,
                sellerUpdate.accountStatus,
                sellerUpdate.adminRemark
            )

            responseReturn(res, 200, {
                accountStatus: sellerUpdate.accountStatus,
                seller: updatedSeller ? withVerificationStatus(updatedSeller) : null,
                message: 'seller status update success'
            })
        } catch (error) {
            responseReturn(res, 500, { error: error.message })
        }
    }

    toggle_seller_status = async (req, res) => {
        const { id: sellerId } = req.params
        const trimmedRemark = String(req.body?.remark || '').trim()

        try {
            const seller = await sellerModel.findById(sellerId)

            if (!seller) {
                return responseReturn(res, 404, { error: 'Seller not found' })
            }

            const currentAccountStatus = normalizeAccountStatus(seller)
            const nextAccountStatus = currentAccountStatus === ACCOUNT_STATUS.ACTIVE
                ? ACCOUNT_STATUS.INACTIVE
                : ACCOUNT_STATUS.ACTIVE

            if (nextAccountStatus === ACCOUNT_STATUS.INACTIVE && !trimmedRemark) {
                return responseReturn(res, 400, { error: 'Remark is required when deactivating a seller' })
            }

            const sellerUpdate = buildSellerStatusUpdate({
                nextAccountStatus,
                remark: trimmedRemark
            })

            await sellerModel.findByIdAndUpdate(sellerId, sellerUpdate)
            const updatedSeller = await sellerModel.findById(sellerId)

            await sendAccountStatusMail(
                updatedSeller,
                sellerUpdate.accountStatus,
                sellerUpdate.adminRemark
            )

            return responseReturn(res, 200, {
                accountStatus: sellerUpdate.accountStatus,
                seller: updatedSeller ? withVerificationStatus(updatedSeller) : null,
                message: nextAccountStatus === ACCOUNT_STATUS.ACTIVE
                    ? 'Seller activated successfully'
                    : 'Seller deactivated successfully'
            })
        } catch (error) {
            return responseReturn(res, 500, { error: error.message })
        }
    }

    get_active_sellers = async (req, res) => {
        let { page, searchValue, parPage } = req.query
        page = parseInt(page)
        parPage = parseInt(parPage)

        const skipPage = parPage * (page - 1)

        try {
            if (searchValue) {
                const sellers = await sellerModel.find({
                    ...getAccountStatusQuery(ACCOUNT_STATUS.ACTIVE),
                    $text: { $search: searchValue },
                }).skip(skipPage).limit(parPage).sort({ createdAt: -1 })

                const totalSeller = await sellerModel.find({
                    ...getAccountStatusQuery(ACCOUNT_STATUS.ACTIVE),
                    $text: { $search: searchValue },
                }).countDocuments()

                responseReturn(res, 200, {
                    totalSeller,
                    sellers: sellers.map(withVerificationStatus)
                })
            } else {
                const activeSellerQuery = getAccountStatusQuery(ACCOUNT_STATUS.ACTIVE)
                const sellers = await sellerModel.find(activeSellerQuery).skip(skipPage).limit(parPage).sort({ createdAt: -1 })
                const totalSeller = await sellerModel.find(activeSellerQuery).countDocuments()
                responseReturn(res, 200, {
                    totalSeller,
                    sellers: sellers.map(withVerificationStatus)
                })
            }

        } catch (error) {
            console.log('active seller get ' + error.message)
        }
    }

    get_deactive_sellers = async (req, res) => {
        let { page, searchValue, parPage } = req.query
        page = parseInt(page)
        parPage = parseInt(parPage)

        const skipPage = parPage * (page - 1)

        try {
            if (searchValue) {
                const sellers = await sellerModel.find({
                    ...getAccountStatusQuery(ACCOUNT_STATUS.INACTIVE),
                    $text: { $search: searchValue },
                }).skip(skipPage).limit(parPage).sort({ createdAt: -1 })

                const totalSeller = await sellerModel.find({
                    ...getAccountStatusQuery(ACCOUNT_STATUS.INACTIVE),
                    $text: { $search: searchValue },
                }).countDocuments()

                responseReturn(res, 200, {
                    totalSeller,
                    sellers: sellers.map(withVerificationStatus)
                })
            } else {
                const inactiveSellerQuery = getAccountStatusQuery(ACCOUNT_STATUS.INACTIVE)
                const sellers = await sellerModel.find(inactiveSellerQuery).skip(skipPage).limit(parPage).sort({ createdAt: -1 })
                const totalSeller = await sellerModel.find(inactiveSellerQuery).countDocuments()
                responseReturn(res, 200, {
                    totalSeller,
                    sellers: sellers.map(withVerificationStatus)
                })
            }

        } catch (error) {
            console.log('active seller get ' + error.message)
        }
    }
}

module.exports = new sellerController()
