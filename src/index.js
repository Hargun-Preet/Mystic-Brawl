const express = require('express');
require('dotenv').config();
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer);
const loadMap = require("./mapLoader");

const PORT = process.env.PORT || 3000;

const SPEED = 5 * 2;
const TILE_SIZE = 16;
const TICK_RATE = 30;
const ANIMATION_FRAMES = 4;
const STEPS_PER_FRAME = 2;
const SHOOT_SPEED = 10;
const spriteWidth = 16;
const spriteHeight = 32;
const SCALE_FACTOR = 3;
const PLAYER_START_X = 0;
const PLAYER_START_Y = 0;
const PLAYER_HIT_RADIUS = 16 * SCALE_FACTOR / 2;
const MAP_WIDTH = TILE_SIZE * SCALE_FACTOR * 100; // 100 is map width from map.tmx
const MAP_HEIGHT = TILE_SIZE * SCALE_FACTOR * 100; // 100 is map height from map.tmx
const MAX_NAME_LENGTH = 10;

const SPAWN_AREA = {
    minX: MAP_WIDTH * 0.3, // Start at 30% of map width
    maxX: MAP_WIDTH * 0.7, // End at 70% of map width
    minY: MAP_HEIGHT * 0.3, // Start at 30% of map height
    maxY: MAP_HEIGHT * 0.7, // End at 70% of map height
};

const players = [];
let shoots = [];
const inputsMap = [];
let ground2d, decals2d;
const playerScores = new Map(); // Track player kills

function isColliding (rect1, rect2) {
    return (
        rect1.x < rect2.x + rect2.w &&
        rect1.x + rect1.w > rect2.x &&
        rect1.y < rect2.y + rect2.h &&
        rect1.h + rect1.y > rect2.y
    );
}

function isCollidingWithMap(player) {
    for (let row = 0; row < decals2d.length; row++) {
        for (let col = 0; col < decals2d[0].length; col++) {
            const tile = decals2d[row][col];
            // Only check collision if there's actually a tile here
            if (tile && tile.gid !== 0) {
                if (isColliding(
                    {
                        x: player.x,
                        y: player.y,
                        w: 16 * SCALE_FACTOR,
                        h: 32 * SCALE_FACTOR
                    },
                    {
                        x: col * TILE_SIZE * SCALE_FACTOR,
                        y: row * TILE_SIZE * SCALE_FACTOR,
                        w: TILE_SIZE * SCALE_FACTOR,
                        h: TILE_SIZE * SCALE_FACTOR
                    }
                )) {
                    return true;
                }
            }
        }
    }
    return false;
};

// Add this function to get a random spawn position
function getRandomSpawnPoint() {
    let attempts = 0;
    const maxAttempts = 50; // Prevent infinite loops
    
    while (attempts < maxAttempts) {
        // Generate random position within spawn area
        const x = Math.random() * (SPAWN_AREA.maxX - SPAWN_AREA.minX) + SPAWN_AREA.minX;
        const y = Math.random() * (SPAWN_AREA.maxY - SPAWN_AREA.minY) + SPAWN_AREA.minY;
        
        // Create temporary player object to check collision
        const tempPlayer = {
            x: x,
            y: y,
            w: 16 * SCALE_FACTOR,
            h: 32 * SCALE_FACTOR
        };
        
        // Check if position is valid (no collision)
        if (!isCollidingWithMap(tempPlayer)) {
            return { x, y };
        }
        
        attempts++;
    }
    
    // Fallback spawn point if no valid position found
    return { x: SPAWN_AREA.minX, y: SPAWN_AREA.minY };
}

function tick(delta) {
    for (const player of players) {
        const inputs = inputsMap[player.id];
        const wasMoving = player.isMoving;
        player.isMoving = false;
        const previousY = player.y;
        const previousX = player.x;

        // Update player position based on inputs with boundary checks
        if (inputs.up) {
            const newY = player.y - SPEED;
            if (newY >= 0) { // Check top boundary
                player.y = newY;
                player.frameY = 2;
                player.isMoving = true;
            }
        } else if (inputs.down) {
            const newY = player.y + SPEED;
            if (newY + (spriteHeight * SCALE_FACTOR) <= MAP_HEIGHT) { // Check bottom boundary
                player.y = newY;
                player.frameY = 0;
                player.isMoving = true;
            }
        }

        if (isCollidingWithMap(player)) {
            player.y = previousY;
        }

        if (inputs.left) {
            const newX = player.x - SPEED;
            if (newX >= 0) { // Check left boundary
                player.x = newX;
                player.frameY = 3;
                player.isMoving = true;
            }
        } else if (inputs.right) {
            const newX = player.x + SPEED;
            if (newX + (spriteWidth * SCALE_FACTOR) <= MAP_WIDTH) { // Check right boundary
                player.x = newX;
                player.frameY = 1;
                player.isMoving = true;
            }
        }

        if (isCollidingWithMap(player)) {
            player.x = previousX;
        }

        // Handle animation
        if (player.isMoving) {
            // Only increment frame counter if we're moving
            player.frameCounter = (player.frameCounter + 1) % STEPS_PER_FRAME;
            
            // Update animation frame when counter resets
            if (player.frameCounter === 0) {
                player.frameX = (player.frameX + 1) % ANIMATION_FRAMES;
            }
        } else if (!player.isMoving && wasMoving) {
            // Reset to standing frame when stopping
            player.frameX = 0;
            player.frameCounter = 0;
        }
    }

    for (const shoot of shoots) {
        const shootDelta = SHOOT_SPEED * (delta / 1000);
        shoot.x += Math.cos(shoot.angle) * shootDelta * 60;
        shoot.y += Math.sin(shoot.angle) * shootDelta * 60;
        shoot.timeLeft -= delta;

        for (const player of players) {
            // Skip if it's the shooter's own projectile
            if (player.id === shoot.playerId) continue;

            const playerCenterX = player.x + (spriteWidth * SCALE_FACTOR) / 2;
            const playerCenterY = player.y + (spriteHeight * SCALE_FACTOR) / 2;
            
            const distance = Math.sqrt(
                Math.pow(playerCenterX - shoot.x, 2) + 
                Math.pow(playerCenterY - shoot.y, 2)
            );
            // If collision detected
            if (distance <= PLAYER_HIT_RADIUS) {
                const newSpawnPoint = getRandomSpawnPoint();
                // Get killer's name
                const killer = playerScores.get(shoot.playerId);
                
                // Send death screen only to the killed player
                io.to(player.id).emit('player-death', {
                    killerName: killer ? killer.name : 'Unknown Player'
                });

                // Send kill feed message to everyone
                io.emit('kill-feed', {
                    killerName: killer ? killer.name : 'Unknown Player',
                    victimName: player.name
                });
                // Reset player position
                player.x = newSpawnPoint.x;
                player.y = newSpawnPoint.y;
                player.frameX = 0;
                player.frameY = 0;
                player.isMoving = false;
                
                const scorer = playerScores.get(shoot.playerId);
                if (scorer) {
                    scorer.kills++;
                    playerScores.set(shoot.playerId, scorer);
                }

                // Remove the projectile
                shoot.timeLeft = -1;

                // Emit updated leaderboard
                io.emit("leaderboard", getTop5Players());
                break;
            }
        }
    }

    shoots = shoots.filter((shoot) => shoot.timeLeft > 0);

    io.emit("players", players);
    io.emit("shoots", shoots);
}

// Add this function to get top 5 players
function getTop5Players() {
    return Array.from(playerScores.values())
        .sort((a, b) => b.kills - a.kills)
        .slice(0, 5);
}

async function main() {
    ({ground2d, decals2d} = await loadMap());
    
    io.on("connect", (socket) => {
        console.log("user connected", socket.id);

        socket.on("join-game", (playerName) => {
            inputsMap[socket.id] = {
                up: false,
                down: false,
                left: false,
                right: false,
            };

            // Trim the name if it's too long
            const trimmedName = playerName.length > MAX_NAME_LENGTH 
            ? playerName.substring(0, MAX_NAME_LENGTH) + '...'
            : playerName;

            const spawnPoint = getRandomSpawnPoint();

            players.push({
                id: socket.id,
                name: trimmedName, // Add the player name here
                x: spawnPoint.x,
                y: spawnPoint.y,
                frameX: 0,
                frameY: 0,
                frameCounter: 0,
                isMoving: false,
                kills: 0 // Add kills counter
            });

            socket.emit("map", {
                ground: ground2d,
                decals: decals2d,
            });

            socket.on("inputs", (inputs) => {
                inputsMap[socket.id] = inputs;
            });


            socket.on("shoot", (angle) => {
                const player = players.find(player => player.id === socket.id);
                if (player) {
                    shoots.push({
                        angle,
                        x: player.x + (spriteWidth * SCALE_FACTOR) / 2,
                        y: player.y + (spriteHeight * SCALE_FACTOR) / 2,
                        timeLeft: 750,
                        playerId: socket.id,
                        initialX: player.x + (spriteWidth * SCALE_FACTOR) / 2,
                        initialY: player.y + (spriteHeight * SCALE_FACTOR) / 2
                    });
                }
            });

            playerScores.set(socket.id, { name: trimmedName, kills: 0 });
            io.emit("leaderboard", getTop5Players());

            io.emit('player-joined', trimmedName);

            socket.on("disconnect", () => {
                io.emit('player-left', trimmedName);
                playerScores.delete(socket.id);
                io.emit("leaderboard", getTop5Players());
                delete inputsMap[socket.id];
                const index = players.findIndex(player => player.id === socket.id);
                if (index !== -1) {
                    players.splice(index, 1);
                }
            });
        });
    });
    
    app.use(express.static("public"));
    
    httpServer.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });

    let lastUpdate = Date.now();

    setInterval(() => {
        const now = Date.now();
        const delta = now - lastUpdate;
        tick(delta);
        lastUpdate = now;
    }, 1000 / TICK_RATE);
};

main();

