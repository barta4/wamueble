const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

async function test(originStr, destStr) {
    try {
        const key = process.env.GOOGLE_MAPS_API_KEY;
        
        const buildWaypoint = (str) => {
            const match = str.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
            if (match) {
                return {
                    location: {
                        latLng: {
                            latitude: parseFloat(match[1]),
                            longitude: parseFloat(match[2])
                        }
                    }
                };
            }
            return { address: str };
        };
        
        const body = {
            origin: buildWaypoint(originStr),
            destination: buildWaypoint(destStr),
            travelMode: 'DRIVE'
        };
        
        const headers = {
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'routes.distanceMeters',
            'Content-Type': 'application/json'
        };

        const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';
        const res = await axios.post(url, body, { headers });
        console.log('Origin:', originStr, 'Dest:', destStr);
        console.log('Response:', JSON.stringify(res.data, null, 2));
    } catch(e) {
        if (e.response) {
            console.error(e.response.data);
        } else {
            console.error(e.message);
        }
    }
}

test('-34.7924188,-55.9952777', '-34.787391,-55.999427');
test('Av 18 de Julio 1234, Montevideo', 'calle Braniff 312');
test('https://maps.app.goo.gl/pEThJroBe1SJa9jTA', 'calle Braniff 312');
