const mapImage = new Image();
mapImage.src = "/Overworld.png";

const charImage = new Image();
charImage.src = "/character.png";

const runGround = new Audio("running.mp3");
runGround.volume = 1.0; // Adjust volume (0.0 to 1.0)
runGround.loop = true; // Make it loop while walking

const shoot = new Audio("shoot.mp3");

const canvasEl = document.getElementById("canvas");
canvasEl.width = window.innerWidth;
canvasEl.height = window.innerHeight;
const canvas = canvasEl.getContext("2d");

const socket = io(window.location.origin);


const uid = Math.floor(Math.random() * 10000000);

// create Agora client
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

var localTracks = {
  audioTrack: null
};
var remoteUsers = {};
// Agora client options
var options = {
  appid: 'a1b099e05d0547a396199bccf14485b4',
  channel: 'game',
  uid: null,
  token: null
};

async function subscribe(user, mediaType) {
    const uid = user.uid;
    // subscribe to a remote user
    await client.subscribe(user, mediaType);

    if (mediaType === 'audio') {
      user.audioTrack.play();
    }
  }

function handleUserPublished(user, mediaType) {
    const id = user.uid;
    remoteUsers[id] = user;
    subscribe(user, mediaType);
  }
  
  function handleUserUnpublished(user) {
    const id = user.uid;
    delete remoteUsers[id];
  }
  

async function join() {

    // add event listener to play remote tracks when remote user publishs.
    client.on("user-published", handleUserPublished);
    client.on("user-unpublished", handleUserUnpublished);
  
    // join a channel and create local tracks, we can use Promise.all to run them concurrently
    [ options.uid, localTracks.audioTrack] = await Promise.all([
      // join the channel
      client.join(options.appid, options.channel, options.token || null),
      // create local tracks, using microphone and camera
      AgoraRTC.createMicrophoneAudioTrack(),
    ]);
  
    // publish local tracks to channel
    await client.publish(Object.values(localTracks));
    console.log("publish success");
  }

join();

let groundMap = [[]];
let decalMap = [[]];
let players = [];
let shoots = [];

const TILE_SIZE = 16;
const SCALE_FACTOR = 3;
const BACKGROUND_COLOR = '#1e7cb8';
const MAX_NAME_LENGTH = 10; // Adjust this value to scale the map

const loginForm = document.getElementById('login-form');
const loginOverlay = document.getElementById('login-overlay');
const playerNameInput = document.getElementById('player-name');
const startGameButton = document.getElementById('start-game');

startGameButton.addEventListener('click', (e) => {
    e.preventDefault();
    let playerName = playerNameInput.value.trim();
    if (playerName.length > MAX_NAME_LENGTH) {
        playerName = playerName.substring(0, MAX_NAME_LENGTH) + '...';
    }
    if (playerName) {
        loginOverlay.style.display = 'none';
        socket.emit('join-game', playerName);
    }
});

// Focus the input field when the page loads
window.addEventListener('load', () => {
    playerNameInput.focus();
});


socket.on("connect", () => {
    console.log("connected");
});

socket.on ("map", (loadedMap) => {
    groundMap = loadedMap.ground;
    decalMap = loadedMap.decals
});

socket.on("players", (serverPlayers) => {
    players = serverPlayers;
});

socket.on("shoots", (serverShoots) => {
    shoots = serverShoots;
});

// Add after your other socket listeners
socket.on("leaderboard", (topPlayers) => {
    const leaderboardContent = document.getElementById('leaderboard-content');
    leaderboardContent.innerHTML = topPlayers
        .map((player, index) => `
            <div class="leaderboard-entry">
                <span class="name">#${index + 1} ${player.name}</span>
                <span class="kills">${player.kills} kills</span>
            </div>
        `)
        .join('');
});

const muteButton = document.getElementById('mute');
let isMuted = false;

muteButton.addEventListener('click', () => {
    isMuted = !isMuted;
    muteButton.classList.toggle('muted');
    
    // Update the icon
    const icon = muteButton.querySelector('i');
    icon.className = isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
    
    // Handle the audio muting logic here
    if (isMuted) {
        // Mute audio
        localTracks.audioTrack && localTracks.audioTrack.setEnabled(false);
    } else {
        // Unmute audio
        localTracks.audioTrack && localTracks.audioTrack.setEnabled(true);
    }
});

const inputs = {
    up: false,
    down: false,
    left: false,
    right: false
};

// Character properties
const spriteWidth = 16; // Width of a single sprite frame
const spriteHeight = 32; // Height of a single sprite frame
let frameX = 0;
let frameY = 0;
let posX = canvasEl.width / 2 - spriteWidth / 2;
let posY = canvasEl.height / 2 - spriteHeight / 2;
const speed = 16 * SCALE_FACTOR;
let direction = 'down';
let isAnimating = false; // Flag to indicate if the character is animating

// Handle keyboard input
window.addEventListener('keydown', (e) => {
    if (!isAnimating) {
        switch (e.key) {
            case 'a':
                e.preventDefault();
                inputs.left = true;
                direction = 'left';
                frameY = 3;
                animateCharacter(-speed, 0);
                runGround.play().catch(e => console.log("Audio play failed:", e));
                break;
            case 'd':
                e.preventDefault();
                inputs.right = true;
                direction = 'right';
                frameY = 1;
                animateCharacter(speed, 0);
                runGround.play().catch(e => console.log("Audio play failed:", e));
                break;
            case 'w':
                e.preventDefault();
                inputs.up = true;
                direction = 'up';
                frameY = 2;
                animateCharacter(0, -speed);
                runGround.play().catch(e => console.log("Audio play failed:", e));
                break;
            case 's':
                e.preventDefault();
                inputs.down = true;
                direction = 'down';
                frameY = 0;
                animateCharacter(0, speed);
                runGround.play().catch(e => console.log("Audio play failed:", e));
                break;
        }
        socket.emit("inputs", inputs);
    }
});

window.addEventListener('keyup', (e) => {
    switch (e.key) {
        case 'a':
            e.preventDefault();
            inputs.left = false;
            break;
        case 'd':
            e.preventDefault();
            inputs.right = false;
            break;
        case 'w':
            e.preventDefault();
            inputs.up = false;
            break;
        case 's':
            e.preventDefault();
            inputs.down = false;
            break;
    }
    // Only pause if no movement keys are pressed
    if (!inputs.up && !inputs.down && !inputs.left && !inputs.right) {
        runGround.pause();
        runGround.currentTime = 0; // Reset audio to start
    }
    socket.emit("inputs", inputs);
});

window.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const myPlayer = players.find((player) => player.id === socket.id);
    if (myPlayer) {
        // Calculate angle from player position to click position
        const centerX = canvasEl.width / 2;
        const centerY = canvasEl.height / 2;
        const angle = Math.atan2(
            e.clientY - centerY,
            e.clientX - centerX
        );
        socket.emit("shoot", angle);

        // Play shoot sound
        shoot.currentTime = 0; // Reset sound to start
        shoot.volume = 0.4; // Adjust volume as needed
        shoot.play().catch(e => console.log("Shoot sound failed:", e));
    }
});

function animateCharacter(deltaX, deltaY) {
    isAnimating = true;
    let frames = 0;
    const animationInterval = setInterval(() => {
        frameX = (frameX + 1) % 4;
        frames++;
        if (frames >= 4) {
            clearInterval(animationInterval);
            isAnimating = false;
        }
    }, 1000 / 30); 
}

function drawCharacter() {
    canvas.drawImage(
        charImage,
        frameX * spriteWidth,
        frameY * spriteHeight,
        spriteWidth,
        spriteHeight,
        posX,
        posY,
        spriteWidth * SCALE_FACTOR,
        spriteHeight * SCALE_FACTOR
    );
}

let particles = [];

// Function to draw a glowing orb with a gradient
function drawGlowingOrb(canvas, x, y) {
    let gradient = canvas.createRadialGradient(x, y, 3, x, y, 10);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)"); // Bright white core
    gradient.addColorStop(0.4, "rgba(0, 255, 255, 1)"); // Cyan glow
    gradient.addColorStop(0.8, "rgba(138, 43, 226, 0.6)"); // Purple outer edge
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)"); // Fades out

    canvas.shadowBlur = 15;
    canvas.shadowColor = "rgba(0, 255, 255, 0.8)"; // Soft cyan glow
    canvas.fillStyle = gradient;
    canvas.beginPath();
    canvas.arc(x, y, 10, 0, 2 * Math.PI);
    canvas.fill();
    canvas.shadowBlur = 0;
}

// Function to create small particles for the trail
function createParticles(x, y) {
    for (let i = 0; i < 3; i++) { // Small number of particles for subtle effect
        particles.push({
            x: x + (Math.random() - 0.5) * 6, 
            y: y + (Math.random() - 0.5) * 6,
            size: Math.random() * 2 + 1, 
            alpha: 1, 
            color: "rgba(173, 216, 230, 1)", // Light blue glow
            life: Math.random() * 10 + 5, 
            speedX: (Math.random() - 0.5) * 1,
            speedY: (Math.random() - 0.5) * 1
        });
    }
}

// Function to update particle movement & fade out effect
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].alpha -= 0.05; // Fade effect
        particles[i].size -= 0.05; // Shrinking effect
        particles[i].x += particles[i].speedX;
        particles[i].y += particles[i].speedY;

        if (particles[i].alpha <= 0 || particles[i].size <= 0) {
            particles.splice(i, 1); // Remove faded particles
        }
    }
}

// Function to draw the particle trail
function drawParticles(canvas) {
    for (const p of particles) {
        canvas.shadowBlur = 6;
        canvas.shadowColor = "rgba(173, 216, 230, 1)"; 
        canvas.fillStyle = p.color.replace("1)", `${p.alpha})`);
        canvas.beginPath();
        canvas.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
        canvas.fill();
    }
    canvas.shadowBlur = 0;
}

function loop() {
    canvas.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // Fill background
    canvas.fillStyle = BACKGROUND_COLOR;
    canvas.fillRect(0, 0, canvasEl.width, canvasEl.height);

    const myPlayer = players.find((player) => player.id === socket.id);

    let cameraX = 0;
    let cameraY = 0;

    if (myPlayer) {
        // Calculate camera position to center on player
        cameraX = parseInt( myPlayer.x - canvasEl.width / 2 + (spriteWidth * SCALE_FACTOR) / 2);
        cameraY = parseInt(myPlayer.y - canvasEl.height / 2 + (spriteHeight * SCALE_FACTOR) / 2);
    }

    const TILES_IN_ROW = 40;
    
    //ground
    for (let row = 0; row < groundMap.length; row++) {
        for (let col = 0; col < groundMap[0].length; col++) {
            const tile = groundMap[row][col];
            if (tile && tile.id !== undefined) {
                const imageRow = parseInt(tile.id / TILES_IN_ROW);
                const imageCol = parseInt(tile.id % TILES_IN_ROW);
                canvas.drawImage(
                    mapImage,
                    imageCol * TILE_SIZE,
                    imageRow * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE,
                    col * TILE_SIZE * SCALE_FACTOR - cameraX,
                    row * TILE_SIZE * SCALE_FACTOR - cameraY,
                    TILE_SIZE * SCALE_FACTOR,
                    TILE_SIZE * SCALE_FACTOR
                );
            }
        }
    }

    // Draw decal layer on top
    for (let row = 0; row < decalMap.length; row++) {
        for (let col = 0; col < decalMap[0].length; col++) {
            const tile = decalMap[row][col];
            if (tile && tile.id !== undefined) {
                const imageRow = parseInt(tile.id / TILES_IN_ROW);
                const imageCol = parseInt(tile.id % TILES_IN_ROW);
                canvas.drawImage(
                    mapImage,
                    imageCol * TILE_SIZE,
                    imageRow * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE,
                    col * TILE_SIZE * SCALE_FACTOR - cameraX,
                    row * TILE_SIZE * SCALE_FACTOR - cameraY,
                    TILE_SIZE * SCALE_FACTOR,
                    TILE_SIZE * SCALE_FACTOR
                );
            }
        }
    }

    // Draw other players
    for (const player of players) {
        canvas.drawImage(
            charImage,
            player.frameX * spriteWidth,
            player.frameY * spriteHeight,
            spriteWidth,
            spriteHeight,
            player.x - cameraX,
            player.y - cameraY,
            spriteWidth * SCALE_FACTOR,
            spriteHeight * SCALE_FACTOR
        );

         // Draw player name
        canvas.font = '12px "Press Start 2P"';
        canvas.textAlign = 'center'; // Center the text horizontally
        canvas.fillStyle = 'white';
        canvas.strokeStyle = 'black';
        canvas.lineWidth = 3;

        const nameX = player.x - cameraX + (spriteWidth * SCALE_FACTOR) / 2;
        const nameY = player.y - cameraY - 5; // Position above player
        
        // Draw name with outline for better visibility
        canvas.strokeText(player.name, nameX, nameY);
        canvas.fillText(player.name, nameX, nameY);
    }

    for (const shoot of shoots) {
        createParticles(shoot.x - cameraX, shoot.y - cameraY); // Generate trail effect
        drawGlowingOrb(canvas, shoot.x - cameraX, shoot.y - cameraY); // Draw glowing projectile
    }
    
    // Update and draw particles
    updateParticles();
    drawParticles(canvas);

    window.requestAnimationFrame(loop);
}

window.requestAnimationFrame(loop);