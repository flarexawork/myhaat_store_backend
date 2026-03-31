const { responseReturn } = require('../utiles/response')

module.exports.createRateLimit = ({ windowMs, max, message, keyGenerator }) => {
    const requests = new Map()

    return (req, res, next) => {
        const now = Date.now()

        for (const [key, value] of requests.entries()) {
            if (value.resetTime <= now) {
                requests.delete(key)
            }
        }

        const key = keyGenerator ? keyGenerator(req) : `${req.ip || 'unknown'}:${req.originalUrl}`
        const current = requests.get(key)

        if (!current || current.resetTime <= now) {
            requests.set(key, {
                count: 1,
                resetTime: now + windowMs
            })
            return next()
        }

        if (current.count >= max) {
            return responseReturn(res, 429, {
                message
            })
        }

        current.count += 1
        requests.set(key, current)
        return next()
    }
}
