package main

import (
    "bufio"
    "fmt"
    "io/ioutil"
    "os"
    "os/exec"
    "path/filepath"
    "strings"
    "time"

    "github.com/valyala/fasthttp"
)

type Config struct {
    Directories struct {
        LogDirectory string `json:"LogDirectory"`
    } `json:"Directories"`
    Webhooks struct {
        Mainlogger string `json:"Mainlogger"`
    } `json:"Webhooks"`
}

func writeModerationToFile(moderationManager string) {
    f, err := os.OpenFile("Moderation_new.txt", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
    if err != nil {
        writeErrorToFile(err.Error())
        return
    }
    defer f.Close()

    if _, err := f.WriteString(moderationManager + "\n"); err != nil {
        writeErrorToFile(err.Error())
    }
}

func writeErrorToFile(errMsg string) {
    f, err := os.OpenFile("error.txt", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
    if err != nil {
        fmt.Println("Error opening error file:", err)
        return
    }
    defer f.Close()

    if _, err := f.WriteString(errMsg + "\n"); err != nil {
        fmt.Println("Error writing to error file:", err)
    }
}

func readNewLogs(logFilePath string, lastReadPosition int64) ([]string, int64) {
    fileData, err := ioutil.ReadFile(logFilePath)
    if err != nil {
        writeErrorToFile(err.Error())
        return nil, 0
    }
    newLogs := strings.Split(string(fileData[lastReadPosition:]), "\n")
    newLastReadPosition := int64(len(fileData))
    return newLogs, newLastReadPosition
}

func sendToWebhook(logEntry, webhookUrl string) {
    req := fasthttp.AcquireRequest()
    resp := fasthttp.AcquireResponse()
    defer fasthttp.ReleaseRequest(req)
    defer fasthttp.ReleaseResponse(resp)

    req.Header.SetMethod("POST")
    req.SetRequestURI(webhookUrl)
    req.SetBodyString(logEntry)

    if err := fasthttp.Do(req, resp); err != nil {
        fmt.Println("Error sending to webhook:", err)
        writeErrorToFile(err.Error())
    }
}

func monitorAndSend(logDirectory string, webhookUrls map[string]string) {
    logFileNames, err := filepath.Glob(filepath.Join(logDirectory, "output_log*"))
    if err != nil {
        fmt.Println("Error finding log files:", err)
        return
    }
    if len(logFileNames) == 0 {
        fmt.Println("No VRChat log files found.")
        return
    }

    lastReadPositions := make(map[string]int64)
    for _, fileName := range logFileNames {
        fileInfo, err := os.Stat(fileName)
        if err != nil {
            fmt.Println("Error getting file info:", err)
            continue
        }
        lastReadPositions[fileName] = fileInfo.Size()
    }

    fmt.Println("Monitoring and sending VRChat logs to webhooks...")

    for {
        vrchatProcess, err := exec.Command("tasklist", "/FI", "IMAGENAME eq VRChat.exe").Output()
        if err != nil {
            fmt.Println("Error checking VRChat process:", err)
            continue
        }
        if !strings.Contains(string(vrchatProcess), "VRChat.exe") {
            fmt.Println("VRChat process is not running. Exiting the application...")
            os.Exit(1)
        }

        for _, logFilePath := range logFileNames {
            fileInfo, err := os.Stat(logFilePath)
            if err != nil {
                fmt.Println("Error getting file info:", err)
                continue
            }
            currentSize := fileInfo.Size()
            if currentSize > lastReadPositions[logFilePath] {
                newLogs, newLastReadPosition := readNewLogs(logFilePath, lastReadPositions[logFilePath])
                for _, log := range newLogs {
                    if strings.Contains(log, "OnPlayerLeftRoom") {
                        continue // Skip this log entry entirely
                    } else if strings.Contains(log, "Joining or Creating Room") {
                        logParts := strings.Fields(log)
                        for i, part := range logParts {
                            if part == "[Behaviour]" {
                                logParts = append(logParts[:i], logParts[i+1:]...)
                                break
                            }
                        }
                        fmt.Println("Joining/Creating", strings.Join(logParts, " "))
                        sendToWebhook(strings.Join(logParts, " "), webhookUrls["Mainlogger"])
                    } // Add other log conditions here
                }
                lastReadPositions[logFilePath] = newLastReadPosition
            }
        }
        time.Sleep(1 * time.Second) // Adjust the polling interval as needed
    }
}

func main() {
    // Load configuration from config.json
    configFile, err := ioutil.ReadFile("config.json")
    if err != nil {
        fmt.Println("Error reading config file:", err)
        return
    }
    var config Config
    if err := json.Unmarshal(configFile, &config); err != nil {
        fmt.Println("Error unmarshalling config:", err)
        return
    }

    logDirectory := config.Directories.LogDirectory
    webhookUrls := map[string]string{
        "Mainlogger": config.Webhooks.Mainlogger,
    }

    monitorAndSend(logDirectory, webhookUrls)
}
