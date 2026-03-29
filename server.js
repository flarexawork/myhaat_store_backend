const express = require('express')
const path = require('path')
const fs = require('fs')
const cors = require('cors')
const http = require('http')
const cookieParser = require('cookie-parser')
require('dotenv').config()

const { dbConnect } = require('./utiles/db')
const socket = require('socket.io')

const app = express()
const server = http.createServer(app)

const normalizeUrl = (value) => {
    if (!value) return null
    return value.trim().replace(/\/+$/, '')
}

const mode = (process.env.MODE || process.env.mode || process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase()
const isProduction = mode === 'production'
const port = Number(process.env.PORT) || 5000
const shouldLogRequests = (process.env.LOG_REQUESTS || 'true').trim().toLowerCase() !== 'false'
const serveFrontend = (process.env.SERVE_FRONTEND || 'false').trim().toLowerCase() === 'true'
const frontendBuildDir = path.resolve(
    __dirname,
    (process.env.FRONTEND_BUILD_DIR || 'build').trim()
)

const allowedOrigins = Array.from(
    new Set(
        [
            isProduction ? null : 'http://localhost:3000',
            isProduction ? null : 'http://localhost:3001',
            process.env.USER_PANEL_LOCAL_URL,
            process.env.user_panel_lcoal_url,
            process.env.ADMIN_PANEL_LOCAL_URL,
            process.env.admin_panel_lcoal_url,
            process.env.USER_PANEL_PRODUCTION_URL,
            process.env.user_panel_production_url,
            process.env.ADMIN_PANEL_PRODUCTION_URL,
            process.env.admin_panel_production_url,
            process.env.FRONTEND_URL
        ]
            .map(normalizeUrl)
            .filter(Boolean)
    )
)

const isAllowedOrigin = (origin) => !origin || allowedOrigins.includes(normalizeUrl(origin))

const corsOptions = {
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
            return callback(null, true)
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS']
}

app.disable('x-powered-by')

if (isProduction) {
    app.set('trust proxy', 1)
}

app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    })
    next()
})

if (shouldLogRequests) {
    app.use((req, res, next) => {
        const start = Date.now()

        res.on('finish', () => {
            console.log(
                `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`
            )
        })

        next()
    })
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

const io = socket(server, {
    cors: {
        origin(origin, callback) {
            if (isAllowedOrigin(origin)) {
                return callback(null, true)
            }

            return callback(new Error(`Socket CORS blocked for origin: ${origin}`))
        },
        credentials: true
    }
})


// var allCustomer = []
// var allSeller = []

// const addUser = (customerId, socketId, userInfo) => {
//     const checkUser = allCustomer.some(u => u.customerId === customerId)
//     if (!checkUser) {
//         allCustomer.push({
//             customerId,
//             socketId,
//             userInfo
//         })
//     }
// }


// const addSeller = (sellerId, socketId, userInfo) => {
//     const chaeckSeller = allSeller.some(u => u.sellerId === sellerId)
//     if (!chaeckSeller) {
//         allSeller.push({
//             sellerId,
//             socketId,
//             userInfo
//         })
//     }
// }


// const findCustomer = (customerId) => {
//     return allCustomer.find(c => c.customerId === customerId)
// }
// const findSeller = (sellerId) => {
//     return allSeller.find(c => c.sellerId === sellerId)
// }

// const remove = (socketId) => {
//     allCustomer = allCustomer.filter(c => c.socketId !== socketId)
//     allSeller = allSeller.filter(c => c.socketId !== socketId)
// }

// let admin = {}

// const removeAdmin = (socketId) => {
//     if (admin.socketId === socketId) {
//         admin = {}
//     }
// }


// io.on('connection', (soc) => {
//     console.log('socket server is connected...')

//     soc.on('add_user', (customerId, userInfo) => {
//         addUser(customerId, soc.id, userInfo)
//         io.emit('activeSeller', allSeller)
//         io.emit('activeCustomer', allCustomer)
//     })
//     soc.on('add_seller', (sellerId, userInfo) => {
//         addSeller(sellerId, soc.id, userInfo)
//         io.emit('activeSeller', allSeller)
//         io.emit('activeCustomer', allCustomer)
//         io.emit('activeAdmin', { status: true })

//     })

//     soc.on('add_admin', (adminInfo) => {
//         delete adminInfo.email
//         admin = adminInfo
//         admin.socketId = soc.id
//         io.emit('activeSeller', allSeller)
//         io.emit('activeAdmin', { status: true })

//     })
//     soc.on('send_seller_message', (msg) => {
//         const customer = findCustomer(msg.receverId)
//         if (customer !== undefined) {
//             soc.to(customer.socketId).emit('seller_message', msg)
//         }
//     })

//     soc.on('send_customer_message', (msg) => {
//         const seller = findSeller(msg.receverId)
//         if (seller !== undefined) {
//             soc.to(seller.socketId).emit('customer_message', msg)
//         }
//     })

//     soc.on('send_message_admin_to_seller', msg => {
//         const seller = findSeller(msg.receverId)
//         if (seller !== undefined) {
//             soc.to(seller.socketId).emit('receved_admin_message', msg)
//         }
//     })


//     soc.on('send_message_seller_to_admin', msg => {

//         if (admin.socketId) {
//             soc.to(admin.socketId).emit('receved_seller_message', msg)
//         }
//     })


//     soc.on('disconnect', () => {
//         console.log('user disconnect')
//         remove(soc.id)
//         removeAdmin(soc.id)
//         io.emit('activeAdmin', { status: false })
//         io.emit('activeSeller', allSeller)
//         io.emit('activeCustomer', allCustomer)

//     })
// })

// ================= ADMIN CENTERED CHAT SOCKET =================

let onlineUsers = []

const addUser = (userId, role, socketId) => {
    const exists = onlineUsers.some(u => u.userId === userId)
    if (!exists) {
        onlineUsers.push({ userId, role, socketId })
    }
}

const findUser = (userId) => {
    return onlineUsers.find(u => u.userId === userId)
}

const removeUser = (socketId) => {
    onlineUsers = onlineUsers.filter(u => u.socketId !== socketId)
}

io.on('connection', (soc) => {
    console.log('socket connected')

    // Register any user (admin, seller, customer)
    soc.on('register', ({ userId, role }) => {
        addUser(userId, role, soc.id)
    })

    // Unified message system
    soc.on('send_message', (msg) => {
        const receiver = findUser(msg.receiverId)
        if (receiver) {
            soc.to(receiver.socketId).emit('receive_message', msg)
        }
    })

    soc.on('disconnect', () => {
        console.log('socket disconnected')
        removeUser(soc.id)
    })
})


app.use(cookieParser())

app.use(
    express.json({
        verify: function (req, res, buf) {
            if (req.originalUrl.startsWith('/api/order/webhook')) {
                req.rawBody = buf.toString()
            }
        }
    })
)

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'backend',
        mode,
        apiBase: '/api'
    })
})

app.use('/api', require('./routes/chatRoutes'))


app.use('/api', require('./routes/paymentRoutes'))
app.use('/api', require('./routes/bannerRoutes'))
app.use('/api', require('./routes/dashboard/dashboardIndexRoutes'))

app.use('/api/home', require('./routes/home/homeRoutes'))
app.use('/api', require('./routes/order/orderRoutes'))
app.use('/api', require('./routes/home/cardRoutes'))
app.use('/api', require('./routes/authRoutes'))
app.use('/api', require('./routes/home/customerAuthRoutes'))
app.use('/api', require('./routes/dashboard/sellerRoutes'))
app.use('/api', require('./routes/dashboard/categoryRoutes'))
app.use('/api', require('./routes/dashboard/productRoutes'));

app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API route not found'
    })
})

if (serveFrontend) {
    if (!fs.existsSync(frontendBuildDir)) {
        console.warn(`Frontend build directory not found: ${frontendBuildDir}`)
    } else {
        app.use(express.static(frontendBuildDir))

        app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
            res.sendFile(path.join(frontendBuildDir, 'index.html'))
        })
    }
} else {
    app.get('/', (req, res) => {
        res.status(200).json({
            status: 'ok',
            message: 'Backend API is running',
            apiBase: '/api',
            allowedOrigins
        })
    })
}

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    })
})

app.use((err, req, res, next) => {
    console.error(err)

    if (res.headersSent) {
        return next(err)
    }

    const statusCode = err.statusCode || err.status || (err.message && err.message.startsWith('CORS blocked') ? 403 : 500)

    return res.status(statusCode).json({
        success: false,
        message: statusCode === 500 ? 'Internal server error' : err.message
    })
})

dbConnect()
server.listen(port, () => console.log(`Server is running on port ${port}!`))
