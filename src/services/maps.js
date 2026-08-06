const axios = require('axios');
const Store = require('../models/Store');

class MapsService {
    /**
     * Calcula la distancia en kilómetros entre el local y la dirección del cliente
     * utilizando la API de Google Maps (Distance Matrix).
     * 
     * @param {number} storeId - ID del local
     * @param {string} customerAddress - Dirección proveída por el cliente (texto o link)
     * @returns {Promise<number|null>} Distancia en kilómetros, o null si falla
     */
    static async calculateDistanceKm(storeId, customerAddress) {
        try {
            const apiKey = process.env.GOOGLE_MAPS_API_KEY;
            if (!apiKey || apiKey === 'your_google_maps_api_key_here') {
                console.warn('⚠️ GOOGLE_MAPS_API_KEY no está configurada o es inválida.');
                // En modo dev/simulación si no hay API key, podemos mockear un resultado
                // o retornar null para que la IA asuma algo.
                return null;
            }

            const store = Store.getById(storeId);
            if (!store || !store.address) {
                console.warn('⚠️ No se encontró la dirección del local.');
                return null;
            }

            async function resolveUrl(url) {
                if (url && url.includes('maps.app.goo.gl')) {
                    try {
                        const res = await axios.get(url, { maxRedirects: 0, validateStatus: null });
                        if (res.headers.location) return res.headers.location;
                    } catch(e) {}
                }
                return url;
            }

            function extractCoordinates(addressStr) {
                if (!addressStr) return '';
                const match = addressStr.match(/(-?\d{1,2}\.\d{4,})[^0-9-]+(-?\d{1,3}\.\d{4,})/);
                if (match) return `${match[1]},${match[2]}`;
                return addressStr;
            }

            let origin = await resolveUrl(store.address);
            origin = encodeURIComponent(extractCoordinates(origin));
            
            let destination = await resolveUrl(customerAddress);
            destination = encodeURIComponent(extractCoordinates(destination));

            const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&key=${apiKey}`;
            
            const response = await axios.get(url);
            const data = response.data;

            if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
                // distance.value está en metros
                const meters = data.rows[0].elements[0].distance.value;
                return meters / 1000;
            } else {
                console.warn('⚠️ Google Maps no pudo calcular la distancia:', data);
                return null;
            }
        } catch (error) {
            console.error('❌ Error calculando distancia con Google Maps:', error.message);
            return null;
        }
    }
}

module.exports = MapsService;
