const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const axios = require('axios');

const config = require('./config.json'); // Assuming config.json contains your configuration

function writeModerationToFile(moderationManager) {
    fs.appendFileSync('Moderation_new.txt', `${moderationManager}\n`, 'utf-8');
}

function writeErrorToFile(error) {
    fs.appendFileSync('error.txt', `${error}\n`, 'utf-8');
}

function readNewLogs(logFilePath, lastReadPosition) {
    const fileData = fs.readFileSync(logFilePath, 'utf-8');
    const newLogs = fileData.substring(lastReadPosition).split('\n');
    const newLastReadPosition = fileData.length;
    return [newLogs, newLastReadPosition];
}

async function sendToWebhook(logEntry, webhookUrl) {
    try {
        await axios.post(webhookUrl, { content: logEntry });
    } catch (error) {
        console.error(`Error sending to webhook: ${error.message}`);
        writeErrorToFile(error.message);
    }
}

async function monitorAndSend(logDirectory, webhookUrls) {
    const logFileNames = fs.readdirSync(logDirectory).filter(fileName => fileName.startsWith("output_log"));
    if (logFileNames.length === 0) {
        console.log("No VRChat log files found.");
        return;
    }

    const logFilePaths = logFileNames.map(fileName => path.join(logDirectory, fileName));
    const lastReadPositions = {};
    logFilePaths.forEach(filePath => {
        lastReadPositions[filePath] = fs.statSync(filePath).size;
    });

    console.log("Monitoring and sending VRChat logs to webhooks...");

    try {
        while (true) {
            const vrchatProcess = spawnSync('tasklist', ['/FI', 'IMAGENAME eq VRChat.exe']).stdout.toString();
            if (!vrchatProcess.includes('VRChat.exe')) {
                console.log("VRChat process is not running. Exiting the application...");
                process.exit(1);
            }

            for (const logFilePath of logFilePaths) {
                const currentSize = fs.statSync(logFilePath).size;
                if (currentSize > lastReadPositions[logFilePath]) {
                    const [newLogs, newLastReadPosition] = readNewLogs(logFilePath, lastReadPositions[logFilePath]);
                    newLogs.forEach(log => {
                        if (log.includes("OnPlayerLeftRoom")) {
                            return; // Skip this log entry entirely
                        } else if (log.includes("Joining or Creating Room")) {
                            const logParts = log.split(' ');
                            logParts.splice(logParts.indexOf('[Behaviour]'), 1);
                            console.log(`Joining/Creating ${logParts.join(' ')}`);
                            sendToWebhook(logParts.join(' '), webhookUrls['Mainlogger']);
                        } // Add other log conditions here
                    });
                    lastReadPositions[logFilePath] = newLastReadPosition;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Adjust the polling interval as needed
        }
    } catch (error) {
        console.error(`An error occurred: ${error.message}`);
        writeErrorToFile(error.message);
        process.exit(1);
    }
}

const logDirectory = config.Directories.LogDirectory;
const webhookUrls = {
    'Mainlogger': config.Webhooks.Mainlogger
};

monitorAndSend(logDirectory, webhookUrls);
