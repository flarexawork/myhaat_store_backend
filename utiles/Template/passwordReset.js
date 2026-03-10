module.exports = (name, resetLink) => `
    <div style="background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#102033;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #dfe7f1;">
            <p style="font-size:14px;color:#5b6b7c;margin:0 0 12px;">Hello${name ? ` ${name}` : ''},</p>
            <h2 style="margin:0 0 16px;font-size:24px;color:#102033;">Reset your MyHaat password</h2>
            <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">
                You requested to reset your password. Use the link below to set a new password.
            </p>
            <div style="margin:24px 0;">
                <a href="${resetLink}" style="display:inline-block;background:#102033;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:600;">
                    Reset Password
                </a>
            </div>
            <p style="font-size:14px;line-height:1.7;margin:0 0 12px;">
                This link will expire in 1 hour. If the button does not work, use this link:
            </p>
            <p style="font-size:14px;word-break:break-all;margin:0 0 20px;color:#1b4d8b;">
                ${resetLink}
            </p>
            <p style="font-size:14px;line-height:1.7;margin:0 0 8px;">
                If you did not request this, please ignore this email.
            </p>
            <p style="font-size:14px;margin:24px 0 0;color:#5b6b7c;">Team MyHaat</p>
        </div>
    </div>
`
