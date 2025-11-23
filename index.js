// index.js
const Discord = require("discord.js-selfbot-v13");
let { config, spamMessages, pokemonList } = require("./config"); 
const { getRandomInt, pickRandom, saveConfig, reportError } = require("./utils"); 
const { handleCommand, setupCommands } = require("./commands");
const { handlePokemonMessage, globalState } = require("./pokemonHandler");

//============== INICIALIZACIÓN DE CONSOLA ================
const readlineSync = require('readline-sync'); 

//============== SISTEMA DE SPAM AUTOMÁTICO ================
let spamInterval = null;
async function startSpam(client) {
    if (spamInterval) return;
    async function spamLoop() {
        while (config.spamming && config.spamChannel) {
            if (globalState.paused) {
                console.log("[SPAM] Paused for captcha. No spam messages will be sent until resumed.");
                break;
            }
            try {
                const channel = await client.channels.fetch(config.spamChannel);
                if (channel) {
                    const msg = pickRandom(spamMessages);
                    await channel.send(msg);
                }
            } catch (e) { /* ignore errors */ }
            const delay = getRandomInt(config.settings.spamMinDelay, config.settings.spamMaxDelay);
            await new Promise(res => setTimeout(res, delay));
        }
        spamInterval = null;
    }
    spamInterval = spamLoop();
}

function stopSpam() {
    config.spamming = false;
    spamInterval = null;
}

//============== CLIENTE DISCORD ================
const client = new Discord.Client({ checkUpdate: false });
globalThis.client = client; 


async function validateToken(token) {
    if (!token || token.length < 50 || token.includes(' ')) return { isValid: false, userId: null }; 
    
    const tempClient = new Discord.Client({ checkUpdate: false });
    try {
        const loginPromise = tempClient.login(token);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Login timeout')), 5000));
        
        await Promise.race([loginPromise, timeoutPromise]);
        
        const userId = tempClient.user.id;
        tempClient.destroy(); 
        return { isValid: true, userId: userId };
    } catch (e) {
        tempClient.destroy();
        return { isValid: false, userId: null };
    }
}

//============== CONFIGURACIÓN Y CONEXIÓN ================
async function setupProgram() {
    let currentConfig = config;
    let tokenValidated = false;
    let botUserId = null;
    
    let currentTokenValid = false;
    if (currentConfig.TOKEN !== 'YOU_TOKEN_HERE') {
        console.log("Checking current token validity...");
        const validationResult = await validateToken(currentConfig.TOKEN);
        currentTokenValid = validationResult.isValid;
        botUserId = validationResult.userId;
    }
    
    let needsSetup = currentConfig.TOKEN === 'YOU_TOKEN_HERE' || !currentTokenValid;
    
    if (needsSetup) {
        console.log("======================================================");
        console.log("   Initial Setup / Token  Required             ");
        console.log("======================================================");

        let newToken = '';
        if (currentConfig.TOKEN !== 'YOU_TOKEN_HERE' && !currentTokenValid) {
            console.log("\n⚠️ WARNING: Your current token is invalid or expired. Please provide a new token.");
        } else if (currentConfig.TOKEN === 'YOU_TOKEN_HERE') {
            console.log("\nWelcome! It looks like this is the first time you are running the program.");
        }

        while (!tokenValidated) {
            newToken = readlineSync.question('Please provide your Token: ').trim();
            
            if (newToken === '') {
                 console.log("\n❌ Token cannot be empty. Please paste your token.");
                 continue;
            }

            console.log("Attempting to validate token...");
            const validationResult = await validateToken(newToken);
            
            if (validationResult.isValid) {
                currentConfig.TOKEN = newToken;
                botUserId = validationResult.userId; 
                tokenValidated = true;
                console.log("✅ Token validated successfully!");
            } else {
                console.log("\n❌ Invalid Token. Please ensure you copied it correctly or generate a new one.");
            }
        }
        
        if (currentConfig.OwnerIDs[0] === 'YOU_ID_HERE' || currentConfig.OwnerIDs.length === 0 || !currentTokenValid) {
            console.log("\n======================================================");
            console.log("   Owner ID Configuration                             ");
            console.log("======================================================");
            
            let ownerIds = [];
            let firstId = '';

            while (!firstId) {
                console.log(`Owner IDs are the IDs of the accounts authorized to use bot commands.`);
                console.log(`⚠️ IMPORTANT: The Owner ID must be a **different account ID** from the Token account (ID: ${botUserId}).`);
                firstId = readlineSync.question('ENTER FIRST OWNER ID: '); 
                const cleanId = firstId.trim();
                
                if (!cleanId) {
                    console.log("Owner ID cannot be empty.");
                } else if (botUserId && cleanId === botUserId) {
                    console.log("\n❌ ERROR: The Owner ID CANNOT be the same as the ID of the Token account. Please provide a different user ID.");
                    firstId = ''; 
                } else {
                    ownerIds.push(cleanId);
                }
            }
            
            let addMore = 'Y';
            while (addMore.toUpperCase() === 'Y') {
                const answer = readlineSync.question('Do you want to add another Owner ID? (Y/N): ');
                addMore = answer.trim().toUpperCase();
                
                if (addMore === 'Y') {
                    let nextId = '';
                    while (!nextId) {
                        nextId = readlineSync.question('ENTER NEXT OWNER ID: ');
                        const cleanId = nextId.trim();
                        if (cleanId) {
                            if (botUserId && cleanId === botUserId) {
                                console.log("\n❌ ERROR: The Owner ID CANNOT be the same as the ID of the Token account. Please provide a different user ID.");
                                continue;
                            } else if (!ownerIds.includes(cleanId)) {
                                ownerIds.push(cleanId);
                                break; 
                            } else {
                                console.log("ID already added.");
                            }
                        }
                        else console.log("Owner ID cannot be empty.");
                    }
                }
            }

            currentConfig.OwnerIDs = ownerIds;
        }


        Object.assign(config, currentConfig); 
        saveConfig(config);
        
        console.log("✅ Setup complete. Connecting to Discord...");
    } else {
         console.log("✅ Configuration found and token is valid. Connecting to Discord...");
    }
    
    setupCommands(client);
    client.login(config.TOKEN)
        .catch(err => {
            console.error("\n=========================================================================");
            console.error("  ❌ FATAL ERROR: Could not connect with the provided token.              ");
            console.error("  Please ensure your token is correct and unexpired.                     ");
            console.error("  Restart the program for a new token setup.                             ");
            console.error("=========================================================================");
            process.exit(1);
        });
}


//============== EVENTO READY (LOG) ================
client.on("ready", async () => {
    const now = new Date();
    const startTime = now.toTimeString().split(' ')[0]; 
    const totalGuilds = client.guilds.cache.size;
    const totalChannels = client.channels.cache.size;
    const listCount = pokemonList.length;

    const isCatchAll = config.catchAll ? 'ON' : 'OFF';
    const isServerAll = config.serverAllMode ? 'ON' : 'OFF';
    
    const spamStatusRaw = config.spamChannel ? (config.spamming ? 'ACTIVE' : 'INACTIVE') : 'Not Configured';
    const logStatusRaw = config.logChannel ? 'Configured' : 'Not Configured';
    const errorStatusRaw = config.errorChannel ? 'Configured' : 'Not Configured';
    const spamChannelStatusRaw = config.spamChannel ? 'Configured' : 'Not Configured';
    
    const connectionStatus = globalState.paused ? 'PAUSED' : 'CONNECTED';

    
    const statusLength = connectionStatus.length;
    const totalPadding = 25 - statusLength; 

    console.log(`
╔════════════════════════════════════════════╗
║   🟢 ${client.user.username.toUpperCase().padEnd(totalPadding)} ${connectionStatus}
╠════════════════════════════════════════════╣
║   📊 STATISTICS:
║   🗄️ Guilds: ${totalGuilds.toString().padEnd(30)}
║   📺 Channels: ${totalChannels.toString().padEnd(28)}
║   ⌚ Start time: ${startTime.padEnd(26)}
╠════════════════════════════════════════════╣
║   ⚙️ CONFIGURATION:
║   🎯 Catch-all: ${isCatchAll.padEnd(27)}
║   🎛 Servers-all: ${isServerAll.padEnd(26)}
║   📝 Name List: ${listCount.toString().padEnd(27)}
║   📬 Spam Channel: ${spamChannelStatusRaw.padEnd(24)}
║   🗒️ Log Channel: ${logStatusRaw.padEnd(26)}
║   🛑 Error Channel: ${errorStatusRaw.padEnd(25)}
║   📩 Spam: ${spamStatusRaw.padEnd(30)}
╠════════════════════════════════════════════╣
║   ℹ️ Auto-Catcher v2.0 - Catch Pokemon
║   🔹 Type: Custom list Selfbot
║   🔹 Prefix (!)  Write:  ( !help )
╚════════════════════════════════════════════╝
    `);

    if (config.spamming && config.spamChannel && !globalState.paused) {
        startSpam(client);
    }
});

//============== EVENTO MESSAGE CREATE ================
client.on("messageCreate", async (message) => {
    
    if (Array.isArray(config.OwnerIDs) && config.OwnerIDs.includes(message.author.id) && message.content.startsWith('!')) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        if (command === 'spam') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'on') {
                config.spamming = true;
                if (config.spamChannel && !globalState.paused) startSpam(client); 
            } else if (sub === 'off') {
                stopSpam();
            }
        }
        handleCommand(message, '!');
        return;
    }
    handlePokemonMessage(message);

    if (!globalState.paused && config.spamming && config.spamChannel && !spamInterval) {
        startSpam(client);
    }
});

//============== INICIO DEL PROGRAMA ================
setupProgram();
