const tmx = require('tmx-parser');

async function loadMap() {
    const map = await new Promise((resolve, reject) => {
        tmx.parseFile("./src/map.tmx", function(err, loadedMap) {
            if (err) return reject(err);
            resolve(loadedMap);
        });
    });
    
    const layer = map.layers[0];
    const groundTiles = layer.tiles;
    const decalTiles = map.layers[1].tiles;
    const ground2d = [];
    const decals2d = [];
    for (let row = 0; row < map.height; row++) {
        const groundRow = [];
        const decalRow = [];
        for (let col = 0; col < map.width; col++) {
            const groundTile =  groundTiles[row * map.height + col];
            groundRow.push({id: groundTile.id, gid: groundTile.gid});
            const decalTile =  decalTiles[row * map.height + col];
            if (decalTile) {
                decalRow.push({id: decalTile.id, gid: decalTile.gid});
            } else {
                decalRow.push(undefined);
            }
        }
        ground2d.push(groundRow); 
        decals2d.push(decalRow);
    }

    return {ground2d, decals2d};
};

module.exports = loadMap;