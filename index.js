\const config = require('./config/config.json');

const twofactor = require("node-2fa");
const WebSocketClient = require("websocket").client; //npm websocket
const vrchat = require("vrchat"); //npm vrchat
require('log-timestamp'); //npm log-timestamp
const axios = require("axios");
const express = require("express");
const chalk = require("chalk");
const bodyParser = require('body-parser');
const {
    Client,
    Message
} = require('node-osc');
const fetch = require('node-fetch');

const app = express();
const oscClient = new Client(config.OSC_TARGET_ADDRESS, config.OSC_TARGET_PORT);

app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());

var port = 9065;
app.listen(port, () => console.log(`App listening at http://localhost:${port}`));

//////////////////////////////////////////////////////
//----------  LOGIN DATA  ----------//
//////////////////////////////////////////////////////
let userAgent = config.userAgent;

const configuration = new vrchat.Configuration({
    username: config.VRCACC.username,
    password: config.VRCACC.password,
    baseOptions: {
        headers: {
            "User-Agent": userAgent,
        }
    }
});
const newToken = twofactor.generateToken(`${config.VRCACC.twofatoken}`);

function Exists(names, ToCheck) {
    return names.includes(ToCheck);
}

//CONFIGURABLE
const axiosConfiguration = axios.create({
    headers: {
        "User-Agent": userAgent,
    },
});
//////////////////////////////////////////////////////
//----------  LOGIN DATA  ----------//
//////////////////////////////////////////////////////

//----------  APIS DEFINED  ----------//
const AuthenticationApi = new vrchat.AuthenticationApi(configuration,
    undefined,
    axiosConfiguration);
const NotificationsApi = new vrchat.NotificationsApi(configuration,
    undefined,
    axiosConfiguration);
const WorldApi = new vrchat.WorldsApi(configuration,
    undefined,
    axiosConfiguration);
const InviteApi = new vrchat.InviteApi(configuration,
    undefined,
    axiosConfiguration);
const UsersApi = new vrchat.UsersApi(configuration,
    undefined,
    axiosConfiguration);
const WorldsApi = new vrchat.WorldsApi(configuration,
    undefined,
    axiosConfiguration);

const GroupsApi = new vrchat.GroupsApi(configuration,
    undefined,
    axiosConfiguration);

const FriendsApi = new vrchat.FriendsApi(configuration,
    undefined,
    axiosConfiguration);

let currentUser;
let vrcHeaders; //Used to connect

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

//CONNECTION CODE
AuthenticationApi.getCurrentUser().then(resp => {
    console.log(resp.data.displayName);
    if (!(resp.data.displayName)) {
        console.log("Attempting 2FA");
        AuthenticationApi.verify2FA({
            code: newToken.token
        }, axiosConfiguration).then(resp => {
            console.log(`Yay, the code was accepted! ${resp.data.verified}`);
        }).then(() => {
            AuthenticationApi.getCurrentUser().then((resp) => {
                currentUser = resp.data;

                console.log("Logged in : " + currentUser.displayName)
                AuthenticationApi.verifyAuthToken().then((resp) => {
                    console.log(`Got auth cookie`);
                    vrcHeaders = {
                        "User-Agent": userAgent,
                        Auth_Cookie: resp.data.token,
                    };
                    console.log(resp.data.token)
                    var client = new WebSocketClient();

                    client.on("connectFailed", function(error) {
                        console.log("Connect Error: " + error.toString());
                    });

                    client.on("connect", function(connection) {
                        console.log("WebSocket Client Connected");

                        if (config.addons.info.toggle) {
                            setInterval(() => {
                                setTimeout(function() {
                                    oscClient.send(
                                        new Message(
                                            "/chatbox/input",
                                            `Welcome to The Black Cat NekoSuneAI! If you need a moderator's assistance, please click the Discord server link in our bio. `,
                                            true,
                                            false
                                        )
                                    );
                                    // NekoSuneVR Community
                                    // The Black Cat
                                    // Just B Club 3
                                    // AlloyXuast Community
                                    // NightLights
                                    // NekoSuneAI
                                }, config.addons.info.msrefresh)
                            }, Math.min(config.addons.info.msrefresh * 2, config.addons.info.endreload))
                        }

                        connection.on("error", function(error) {
                            console.log("Connection Error: " + error.toString());
                        });

                        connection.on("close", function() {
                            console.log("echo-protocol Connection Closed");
                            //sleep(2000);
                            client.connect(
                                "wss://pipeline.vrchat.cloud/?authToken=" + resp.data.token,
                                "echo-protocol",
                                null, {
                                    "User-Agent": userAgent,
                                }
                            );
                        });

                        //Handling incoming messages, parsing etc
                        connection.on("message", function(message) {
                            if (!message.type === "utf8") {
                                return console.error("Message is not of type \"UTF8\"");
                            }

                            try {
                                let parsedMessage;
                                parsedMessage = JSON.parse(message.utf8Data);

                                if (parsedMessage.type == "friend-online") {
                                    parsedMessage = JSON.parse(parsedMessage.content);

                                    try {
                                        HandleFriendOnline(parsedMessage)
                                    } catch (error) {
                                        return console.error(error);
                                    }
                                } else if (parsedMessage.type == "friend-update") {
                                    parsedMessage = JSON.parse(parsedMessage.content);

                                    try {
                                        //HandleFRAdd(parsedMessage)
                                    } catch (error) {
                                        return console.error(error);
                                    }
                                } else if (parsedMessage.type == "friend-offline") {
                                    parsedMessage = JSON.parse(parsedMessage.content);

                                    try {
                                        HandleFriendOffline(parsedMessage)
                                    } catch (error) {
                                        return console.error(error);
                                    }
                                } else if (parsedMessage.type == "friend-delete") {
                                    parsedMessage = JSON.parse(parsedMessage.content);

                                    try {
                                        //HandleFRRemove(parsedMessage)
                                    } catch (error) {
                                        return console.error(error);
                                    }
                                } else if (parsedMessage.type == "friend-add") {
                                    parsedMessage = JSON.parse(parsedMessage.content);

                                    try {
                                        //HandleFRAdd(parsedMessage)
                                    } catch (error) {
                                        return console.error(error);
                                    }
                                } else if (parsedMessage.type == "notification") {
                                    parsedMessage = JSON.parse(parsedMessage.content);

                                    try {
                                        HandleNotification(parsedMessage)
                                    } catch (error) {
                                        return console.error(error);
                                    }
                                }
                            } catch (error) {
                                return console.error("Unprocessed request due to crappy parse: " + error);
                            }
                        });
                    });

                    client.connect(
                        "wss://pipeline.vrchat.cloud/?authToken=" + resp.data.token,
                        "echo-protocol",
                        null, {
                            "User-Agent": userAgent
                        }
                    );
                });
            });
        })
    } else {
        console.log("Dead");
    }
});

// HANDLING A RECIEVED MESSAGE
function HandleNotification(notification) {
    switch (notification.type) {
        case "friendRequest":
            AcceptFriendRequest(notification);
            break;
    }
}

function HandleFriendOffline(data) {
    if (config.addons.vrcapi.toggles.blscan) {
        fetch(`http://192.168.0.235:4025/Blacklist2/${data.userId}`).then(res11 => res11.json()).then(blcheck => {
            if (blcheck.blacklisted == true) {
                FriendsApi.unfriend(data.userId);
                console.log(`${data.user.displayName}(USERID: ${data.userId}) been Defriended`);
                console.log(`${data.user.displayName} been Global Blacklised by World Balancer`);
                console.log(`REASON: ${blcheck.reason}`)
            }
        });
    }
}

function HandleFriendOnline(data) {
    if (config.addons.vrcapi.toggles.blscan) {
        fetch(`http://192.168.0.235:4025/Blacklist2/${data.userId}`).then(res11 => res11.json()).then(blcheck => {
            if (blcheck.blacklisted == true) {
                FriendsApi.unfriend(data.userId);
                console.log(`${data.user.displayName}(USERID: ${data.userId}) been Defriended`);
                console.log(`${data.user.displayName} been Global Blacklised by World Balancer`);
                console.log(`REASON: ${blcheck.reason}`)
            }
        });
    }
}


//AUTO ACCEPT FRIENDS
function AcceptFriendRequest(data) {
    console.log("Recieved friend request from " + data.senderUsername);

    if (config.addons.vrcapi.toggles.blfr) {
        fetch(`http://192.168.0.235:4025/Blacklist2/${data.senderUserId}`).then(res11 => res11.json()).then(blcheck => {
            if (blcheck.blacklisted == true) {
                NotificationsApi.deleteNotification(data.id);
                NotificationsApi.clearNotifications();
                console.log(`${data.senderUsername} been Declined`);
                console.log(`${data.senderUsername} been Global Blacklised by World Balancer`);
                console.log(`REASON: ${blcheck.reason}`)
            } else {
                NotificationsApi.acceptFriendRequest(data.id).then(async () => {
                    await sleep(3000)
                    fetch(`http://localhost:9065/v4/self/get`).then(res => res.json()).then(async resp => {
                        await sleep(3000)
                        oscClient.send(
                            new Message(
                                "/chatbox/input",
                                `Thank You for Friend Request ${data.senderUsername}, now i have over ${resp.data.friends.length} Friends`,
                                true,
                                false
                            )
                        );
                    });
                }).catch(e => {
                    oscClient.send(
                        new Message(
                            "/chatbox/input",
                            `Error: Cant Accept Friend Request Right Now!`,
                            true,
                            false
                        )
                    );
                });
            }
        });
    } else {
        NotificationsApi.acceptFriendRequest(data.id).then(async () => {
            await sleep(3000)
            fetch(`http://localhost:9065/v4/self/get`).then(res => res.json()).then(async resp => {
                await sleep(3000)
                oscClient.send(
                    new Message(
                        "/chatbox/input",
                        `Thank You for Friend Request ${data.senderUsername}, now i have over ${resp.data.friends.length} Friends`,
                        true,
                        false
                    )
                );
            });
        });
    }
}

app.post('/v4/group/send', async (req, res) => {
    GroupsApi.createGroupAnnouncement(req.body.groupid, {
        'title': req.body.title,
        'text': req.body.text,
        'sendNotification': true,
    }).then(resp => {
        res.header("Access-Control-Allow-Origin", "*");
        res.contentType('application/json');
        res.send('{"status": 200, "message": "Sended Announcement!", "data": ' + JSON.stringify(resp.data) + '}');
    }).catch(e => {
        res.header("Access-Control-Allow-Origin", "*");
        res.contentType('application/json');
        console.log(e)
        res.send('{"status": ' + e.response.status + ', "message": "' + e.response.statusText + '"}');
    });
});

app.get('/v4/self/get', async (req, res) => {
    AuthenticationApi.getCurrentUser().then((resp) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.contentType('application/json');
        res.send('{"status": 200, "data": ' + JSON.stringify(resp.data) + '}');
    }).catch(e => {
        res.header("Access-Control-Allow-Origin", "*");
        res.contentType('application/json');
        res.send('{"status": ' + e.response.status + ', "message": "' + e.response.statusText + '"}');
    });
});

app.post('/v4/worldinstance/get', async (req, res) => {

    WorldsApi.getWorldInstance(req.body.world, req.body.instance).then(resp => {
        res.header("Access-Control-Allow-Origin", "*");
        res.contentType('application/json');
        res.send('{"status": 200, "data": ' + JSON.stringify(resp.data) + '}');
    }).catch(e => {
        res.header("Access-Control-Allow-Origin", "*");
        res.contentType('application/json');
        res.send('{"status": ' + e.response.status + ', "message": "' + e.response.statusText + '"}');
    });
});

// Function to check if the Unity package array contains Android platform
function containsAndroidPackage(unityPackages) {
    return unityPackages.some((package) => package.platform === 'android') ? true : false;
}

// Function to check if the Unity package array contains Standalone Windows platform
function containsStandaloneWindowsPackage(unityPackages) {
    return unityPackages.some((package) => package.platform === 'standalonewindows') ? true : false;
}

app.post('/v4/world/get', async (req, res) => {
    WorldsApi.getWorld(req.body.world).then(resp => {
        res.header("Access-Control-Allow-Origin", "*");
        res.contentType('application/json');

        const hideUnityStuff = resp.data;

        const {
            unityPackages,
            ...detailsWithoutPackages
        } = hideUnityStuff;
        res.send('{"status": 200, "isQuestSupported": ' + containsAndroidPackage(resp.data.unityPackages) + ', "data": ' + JSON.stringify(detailsWithoutPackages) + '}');
    }).catch(e => {
        res.header("Access-Control-Allow-Origin", "*");
        res.contentType('application/json');
        res.send('{"status": ' + e.response.status + ', "message": "' + e.response.statusText + '"}');
    });
});

app.post('/v4/users/get', async (req, res) => {
    UsersApi.getUser(req.body.userid).then(resp => {
        res.header("Access-Control-Allow-Origin", "*");
        res.contentType('application/json');
        res.send('{"status": 200, "data": ' + JSON.stringify(resp.data) + '}');
    }).catch(e => {
        res.header("Access-Control-Allow-Origin", "*");
        res.contentType('application/json');
        res.send('{"status": ' + e.response.status + ', "message": "' + e.response.statusText + '"}');
    });
});

app.post('/v4/inivte/public/send', async (req, res) => {

    if (req.body.senderUserId == "" || req.body.senderUserId == null) {
        res.header("Access-Control-Allow-Origin", "*");
        res.contentType('application/json');
        res.send('{"status": 404, "message": "You Missing `senderUserId` in BODY"}');
    }
    AuthenticationApi.getCurrentUser().then((resp) => {
        currentUser = resp.data;

        //console.log(currentUser.presence.world + ":" +currentUser.presence.instance)
        var instanceid = currentUser.presence.world + ":" + currentUser.presence.instance;
        WorldsApi.getWorldInstance(currentUser.presence.world, currentUser.presence.instance).then(WorldData => {
            //console.log(WorldData.data)
            if (WorldData.data.type == 'public') {
                InviteApi.inviteUser(req.body.senderUserId, {
                        instanceId: instanceid
                    })
                    .then((resp) => {
                        res.header("Access-Control-Allow-Origin", "*");
                        res.contentType('application/json');
                        res.send('{"status": 200, "message": "Sended Inivte to User", "data": ' + JSON.stringify(resp.data) + '}');
                    })
                    .catch(err => {
                        console.log(err)
                    });
            } else if (WorldData.data.ownerId == currentUser.id) {
                InviteApi.inviteUser(req.body.senderUserId, {
                        instanceId: instanceid
                    })
                    .then((resp) => {
                        res.header("Access-Control-Allow-Origin", "*");
                        res.contentType('application/json');
                        res.send('{"status": 200, "message": "Sended Inivte to User", "data": ' + JSON.stringify(resp.data) + '}');
                    })
                    .catch(err => {
                        console.log(err)
                    });
            } else {
                res.header("Access-Control-Allow-Origin", "*");
                res.contentType('application/json');
                res.send('{"status": 403, "message": "NOT MY WORLD! DECLINED!"}');
            }
        });
    });
});

// ———————————————[Error Handling]———————————————
process.on("unhandledRejection", (reason, p) => {

    if (reason === "Error [INTERACTION_ALREADY_REPLIED]: The reply to this interaction has already been sent or deferred.") return;

    console.log(chalk.gray("—————————————————————————————————"));
    console.log(
        chalk.white("["),
        chalk.red.bold("AntiCrash"),
        chalk.white("]"),
        chalk.gray(" : "),
        chalk.white.bold("Unhandled Rejection/Catch")
    );
    console.log(chalk.gray("—————————————————————————————————"));
    console.log(reason, p);
});
process.on("uncaughtException", (err, origin) => {
    console.log(chalk.gray("—————————————————————————————————"));
    console.log(
        chalk.white("["),
        chalk.red.bold("AntiCrash"),
        chalk.white("]"),
        chalk.gray(" : "),
        chalk.white.bold("Uncaught Exception/Catch")
    );
    console.log(chalk.gray("—————————————————————————————————"));
    console.log(err, origin);
});
