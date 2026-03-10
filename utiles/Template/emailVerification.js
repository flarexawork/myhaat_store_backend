module.exports = (name, verificationLink) => `
    <div style="background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#102033;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #dfe7f1;">
            <p style="font-size:14px;color:#5b6b7c;margin:0 0 12px;">Hello${name ? ` ${name}` : ''},</p>
            <h2 style="margin:0 0 16px;font-size:24px;color:#102033;">Verify your email to activate your MyHaat account</h2>
            <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">
                Thank you for creating your account.
            </p>
            <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">
                Please verify your email by clicking the link below.
            </p>
            <div style="margin:24px 0;">
                <a href="${verificationLink}" style="display:inline-block;background:#102033;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:600;">
                    Verify Email
                </a>
            </div>
            <p style="font-size:14px;line-height:1.7;margin:0 0 12px;">
                If the button does not work, use this link:
            </p>
            <p style="font-size:14px;word-break:break-all;margin:0 0 20px;color:#1b4d8b;">
                ${verificationLink}
            </p>
            <p style="font-size:14px;line-height:1.7;margin:0 0 8px;">
                After verification you will be able to login.
            </p>
            <p style="font-size:14px;line-height:1.7;margin:0 0 8px;">
                If you did not create this account you can ignore this email.
            </p>
            <p style="font-size:14px;margin:24px 0 0;color:#5b6b7c;">Team MyHaat</p>
        </div>
    </div>
`
