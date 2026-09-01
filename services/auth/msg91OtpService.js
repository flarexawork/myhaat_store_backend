const https = require('https')

const MSG91_WIDGET_BASE_URL = 'https://api.msg91.com/api/v5/widget'
const DEFAULT_TIMEOUT_MS = 10000

class Msg91OtpError extends Error {
    constructor(message, options = {}) {
        super(message)
        this.name = 'Msg91OtpError'
        this.code = options.code || 'MSG91_OTP_ERROR'
        this.statusCode = options.statusCode || 502
        this.providerStatusCode = options.providerStatusCode
    }
}

const normalizeBoolean = (value) => {
    return String(value || '').trim().toLowerCase() === 'true'
}

const getOtpConfig = () => ({
    enabled: normalizeBoolean(process.env.MSG91_OTP_ENABLED),
    authKey: (process.env.MSG91_AUTH_KEY || '').trim(),
    widgetId: (process.env.MSG91_WIDGET_ID || '').trim(),
    timeoutMs: Number(process.env.MSG91_OTP_TIMEOUT_MS) > 0
        ? Number(process.env.MSG91_OTP_TIMEOUT_MS)
        : DEFAULT_TIMEOUT_MS
})

const parseJsonResponse = (rawBody) => {
    if (!rawBody) {
        return {}
    }

    try {
        return JSON.parse(rawBody)
    } catch (error) {
        throw new Msg91OtpError('OTP provider returned an invalid response.', {
            code: 'MSG91_MALFORMED_RESPONSE'
        })
    }
}

const requestWithHttps = ({ url, method = 'POST', headers = {}, body, timeoutMs }) => {
    return new Promise((resolve, reject) => {
        const requestBody = body ? JSON.stringify(body) : undefined

        const req = https.request(
            url,
            {
                method,
                headers: {
                    'content-type': 'application/json',
                    ...(requestBody ? { 'content-length': Buffer.byteLength(requestBody) } : {}),
                    ...headers
                },
                timeout: timeoutMs
            },
            (res) => {
                let responseBody = ''

                res.setEncoding('utf8')
                res.on('data', (chunk) => {
                    responseBody += chunk
                })
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        body: responseBody
                    })
                })
            }
        )

        req.on('timeout', () => {
            req.destroy(new Msg91OtpError('OTP provider request timed out.', {
                code: 'MSG91_TIMEOUT'
            }))
        })

        req.on('error', (error) => {
            if (error instanceof Msg91OtpError) {
                return reject(error)
            }

            return reject(new Msg91OtpError('Unable to contact OTP provider.', {
                code: 'MSG91_NETWORK_ERROR'
            }))
        })

        if (requestBody) {
            req.write(requestBody)
        }

        req.end()
    })
}

const assertConfigured = (config) => {
    if (!config.authKey || !config.widgetId) {
        throw new Msg91OtpError('OTP service is not configured.', {
            code: 'MSG91_CONFIG_MISSING',
            statusCode: 500
        })
    }
}

const assertSuccessfulProviderResponse = (response, data, operation) => {
    if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Msg91OtpError(`OTP ${operation} request failed.`, {
            code: 'MSG91_PROVIDER_ERROR',
            providerStatusCode: response.statusCode
        })
    }

    const status = String(data?.status || data?.type || '').toLowerCase()
    if (status && ['error', 'failed', 'failure'].includes(status)) {
        throw new Msg91OtpError(`OTP ${operation} request was rejected.`, {
            code: 'MSG91_PROVIDER_REJECTED',
            providerStatusCode: response.statusCode
        })
    }
}

const extractReqId = (data) => {
    return data?.reqId || data?.requestId || data?.request_id || data?.message || ''
}

const extractAccessToken = (data) => {
    return data?.accessToken || data?.access_token || data?.['access-token'] || ''
}

const createMsg91OtpService = ({ httpClient = requestWithHttps, configProvider = getOtpConfig } = {}) => {
    const callProvider = async (path, body, operation) => {
        const config = configProvider()
        assertConfigured(config)

        const response = await httpClient({
            url: `${MSG91_WIDGET_BASE_URL}/${path}`,
            method: 'POST',
            headers: {
                authkey: config.authKey
            },
            body,
            timeoutMs: config.timeoutMs
        })

        const data = parseJsonResponse(response.body)
        assertSuccessfulProviderResponse(response, data, operation)

        return data
    }

    const withWidgetId = (config, payload = {}) => ({
        widgetId: config.widgetId,
        ...payload
    })

    return {
        getConfig: configProvider,

        isEnabled() {
            return configProvider().enabled
        },

        async sendOtp(identifier) {
            const config = configProvider()
            assertConfigured(config)

            if (!identifier) {
                throw new Msg91OtpError('OTP identifier is required.', {
                    code: 'MSG91_IDENTIFIER_REQUIRED',
                    statusCode: 400
                })
            }

            const data = await callProvider(
                'sendOtp',
                withWidgetId(config, { identifier }),
                'send'
            )
            const reqId = extractReqId(data)

            if (!reqId) {
                throw new Msg91OtpError('OTP provider did not return a request id.', {
                    code: 'MSG91_MISSING_REQUEST_ID'
                })
            }

            return {
                reqId,
                data
            }
        },

        async retryOtp(reqId, retryChannel) {
            const config = configProvider()
            assertConfigured(config)

            if (!reqId) {
                throw new Msg91OtpError('OTP request id is required.', {
                    code: 'MSG91_REQUEST_ID_REQUIRED',
                    statusCode: 400
                })
            }

            const payload = withWidgetId(config, { reqId })
            if (retryChannel) {
                payload.retryChannel = retryChannel
            }

            const data = await callProvider('retryOtp', payload, 'retry')

            return {
                reqId: extractReqId(data) || reqId,
                data
            }
        },

        async verifyOtp(reqId, otp) {
            const config = configProvider()
            assertConfigured(config)

            if (!reqId || !otp) {
                throw new Msg91OtpError('OTP request id and OTP are required.', {
                    code: 'MSG91_VERIFY_INPUT_REQUIRED',
                    statusCode: 400
                })
            }

            const data = await callProvider(
                'verifyOtp',
                withWidgetId(config, { reqId, otp }),
                'verify'
            )

            return {
                accessToken: extractAccessToken(data),
                data
            }
        },

        async verifyAccessToken(accessToken) {
            const config = configProvider()
            assertConfigured(config)

            if (!accessToken) {
                throw new Msg91OtpError('OTP provider access token is required.', {
                    code: 'MSG91_ACCESS_TOKEN_REQUIRED',
                    statusCode: 400
                })
            }

            const data = await callProvider(
                'verifyAccessToken',
                { 'access-token': accessToken },
                'access token verification'
            )

            return {
                data
            }
        }
    }
}

module.exports = createMsg91OtpService()
module.exports.createMsg91OtpService = createMsg91OtpService
module.exports.Msg91OtpError = Msg91OtpError
module.exports.getOtpConfig = getOtpConfig
