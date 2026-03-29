const express = require('express')
const path = require('path')
const {
    dbConnect
} = require('./utiles/db')

const app = express()
const cors = require('cors')
const http = require('http')
const cookieParser = require('cookie-parser')
require('dotenv').config()

const socket = require('socket.io')

const MODE = process.env.MODE

const server = http.createServer(app)

app.disable('x-powered-by')

app.use(cors({
    origin: MODE === 'production' ? ['http://localhost:3000', process.env.USER_PANEL_PRODUCTION_URL, process.env.ADMIN_PANEL_PRODUCTION_URL] : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}))

const io = socket(server, {
    cors: {
        origin: MODE === 'production' ? ['http://localhost:3000', process.env.USER_PANEL_PRODUCTION_URL, process.env.ADMIN_PANEL_PRODUCTION_URL] : ['http://localhost:3000', 'http://localhost:3001'],
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

const publicDir = path.join(__dirname, 'public')

app.use(express.static(publicDir, {
    extensions: ['html'],
    index: false
}))

app.get('/', (req, res) => {
    res.set({
        'Cache-Control': 'public, max-age=300',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests",
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    })

    res.sendFile(path.join(publicDir, 'index.html'))
})

const port = process.env.PORT
dbConnect()
server.listen(port, () => console.log(`Server is running on port ${port}!`))
