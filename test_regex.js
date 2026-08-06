function extractCoordinates(addressStr) {
    const match = addressStr.match(/(-?\d{1,2}\.\d{4,})[^0-9-]+(-?\d{1,3}\.\d{4,})/);
    if (match) return `${match[1]},${match[2]}`;
    return addressStr;
}

console.log(extractCoordinates('https://www.google.com/maps?q=-34.7924,-55.9952'));
console.log(extractCoordinates('https://www.google.com/maps/search/-34.787391,+-55.999427?entry=tts'));
console.log(extractCoordinates('-34.787391, -55.999427'));
console.log(extractCoordinates('calle Braniff 312'));
