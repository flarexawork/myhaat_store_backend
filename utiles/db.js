const mongoose = require('mongoose');

module.exports.dbConnect = async () => {
    const MODE = process.env.mode
    try {
        if (MODE === 'production') {
            await mongoose.connect(process.env.DB_PRODUCTION_URL, { useNewURLParser: true })
            console.log("Production database connect....")
        } else {
            await mongoose.connect(process.env.DB_LOCAL_URL, { useNewURLParser: true })
            console.log("Local database connect....")
        }

    } catch (error) {
        console.log(error.message)
    }
}