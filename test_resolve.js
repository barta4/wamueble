const axios = require('axios');

async function resolve(url) {
    try {
        const res = await axios.get(url, { maxRedirects: 0, validateStatus: null });
        console.log('Status:', res.status);
        console.log('Location:', res.headers.location);
    } catch(e) {
        console.log(e.message);
    }
}

resolve('https://maps.app.goo.gl/pEThJroBe1SJa9jTA');
