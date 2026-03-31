module.exports = ({
    title,
    intro,
    time,
    ip,
    device,
    note = 'If this was not you, contact support immediately.'
}) => `
    <div style="font-family: Arial, sans-serif; color: #122c55; line-height: 1.6;">
        <h2 style="margin-bottom: 16px;">${title}</h2>
        <p>${intro}</p>
        <div style="margin: 20px 0; padding: 16px; border: 1px solid #e4f0f5; border-radius: 10px; background: #f8fbfd;">
            <p style="margin: 0 0 8px;"><strong>Time:</strong> ${time}</p>
            <p style="margin: 0 0 8px;"><strong>IP:</strong> ${ip || 'Unavailable'}</p>
            <p style="margin: 0;"><strong>Device:</strong> ${device || 'Unknown device'}</p>
        </div>
        <p style="margin: 0;">${note}</p>
    </div>
`
