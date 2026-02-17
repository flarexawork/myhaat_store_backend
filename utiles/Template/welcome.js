const welcomeTemplate = (name) => {
    return `
        <div style="font-family: Arial; padding:20px">
            <h2>Welcome ${name} 🎉</h2>
            <p>Your seller account has been created successfully.</p>
            <p>Start listing your products now.</p>
            <br/>
            <small>© ${new Date().getFullYear()} Ecommerce</small>
        </div>
    `
}

module.exports = welcomeTemplate
