const jwt = require('jsonwebtoken');
const sellerModel = require('../models/sellerModel');

const ALLOWED_INACTIVE_SELLER_ROUTES = [
    { method: 'GET', path: '/api/get-user' },
    { method: 'GET', path: '/api/seller/profile' },
    { method: 'POST', path: '/api/seller/complete-verification' }
]

const isAllowedInactiveSellerRoute = (req) => {
    const requestPath = (req.originalUrl || '').split('?')[0]

    return ALLOWED_INACTIVE_SELLER_ROUTES.some((route) => {
        return route.method === req.method && route.path === requestPath
    })
}

module.exports.authMiddleware = async (req, res, next) => {
    const { authorization } = req.headers

    if (authorization) {
        const token = authorization.split(' ')[1]
        if (token) {
            try {
                const userInfo = await jwt.verify(token, process.env.SECRET)
                req.role = userInfo.role
                req.id = userInfo.id

                if (req.role === 'seller') {
                    const seller = await sellerModel.findById(req.id).select('accountStatus adminRemark status')

                    if (!seller) {
                        return res.status(401).json({ message: 'unauthorized' })
                    }

                    const accountStatus = seller.accountStatus || (seller.status === 'deactive' ? 'inactive' : 'active')

                    if (accountStatus === 'inactive' && !isAllowedInactiveSellerRoute(req)) {
                        return res.status(403).json({
                            error: 'ACCOUNT_DEACTIVATED',
                            remark: seller.adminRemark || ''
                        })
                    }
                }

                next()
            } catch (error) {
                return res.status(401).json({ message: 'unauthorized' })
            }
        } else {
            return res.status(401).json({ message: 'unauthorized' })
        }
    } else {
        return res.status(401).json({ message: 'unauthorized' })
    }

}
