const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
})

const sendMail = async ({ to, subject, html }) => {
    try {
        await transporter.sendMail({
            from: `"${process.env.MAIL_FROM_NAME || 'MyHaat'}" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html
        })
    } catch (error) {
        console.log("MAIL ERROR:", error)
        throw new Error('Email sending failed')
    }
}

module.exports = sendMail
