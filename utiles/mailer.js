const nodemailer = require('nodemailer');
require("dotenv").config();

const DEBUG = true;

// 🔍 Helper to mask sensitive values
const mask = (str = "") => {
    if (!str) return "❌ EMPTY";
    return str.substring(0, 3) + "****" + str.substring(str.length - 2);
};

// 🔍 ENV DEBUG
if (DEBUG) {
    console.log("========== SMTP DEBUG START ==========");
    console.log("SMTP_HOST:", process.env.SMTP_HOST || "❌ NOT SET");
    console.log("SMTP_PORT:", process.env.SMTP_PORT || "❌ NOT SET");
    console.log("SMTP_USER:", mask(process.env.SMTP_USER));
    console.log("SMTP_PASS:", process.env.SMTP_PASS ? "✅ SET" : "❌ NOT SET");
    console.log("MAIL_FROM_NAME:", process.env.MAIL_FROM_NAME || "DEFAULT (MyHaat)");
    console.log("======================================");
}

// 🚀 Create transporter with debug enabled
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false, // true for 465, false for 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    debug: true,   // 🔥 nodemailer internal logs
    logger: true   // 🔥 detailed logs
});

// 🔍 Verify connection BEFORE sending
const verifyTransport = async () => {
    try {
        console.log("🔄 Verifying SMTP connection...");
        await transporter.verify();
        console.log("✅ SMTP connection successful");
    } catch (err) {
        console.error("❌ SMTP VERIFY FAILED");
        console.error("Error Code:", err.code);
        console.error("Error Message:", err.message);
        console.error("Full Error:", err);
    }
};

// ✉️ Send mail
const sendMail = async ({ to, subject, html }) => {
    try {
        if (DEBUG) {
            console.log("📨 Attempting to send email...");
            console.log("TO:", to);
            console.log("SUBJECT:", subject);
        }

        await verifyTransport(); // 🔥 important debug step

        const info = await transporter.sendMail({
            from: `"${process.env.MAIL_FROM_NAME || 'MyHaat'}" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html
        });

        console.log("✅ EMAIL SENT SUCCESS");
        console.log("Message ID:", info.messageId);
        console.log("Response:", info.response);

    } catch (error) {
        console.error("❌ MAIL ERROR OCCURRED");
        console.error("Error Code:", error.code);
        console.error("Error Command:", error.command);
        console.error("Error Response:", error.response);
        console.error("Full Error:", error);

        throw new Error('Email sending failed');
    }
};

module.exports = sendMail;