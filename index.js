const chromeLocation = require("chrome-location");
const puppeteer = require("puppeteer-core");
const WebSocket = require("ws");

async function test(browser) {
    const page = await browser.newPage();

    // replace me with your liveserver address
    await page.goto("http://127.0.0.1:5500/public/index.html");

    await page.type("#text-field", "hi");
}


function filter(message) {
    let data = JSON.parse(message);
    if (!data.method) return message;
    if (data.method === "Runtime.callFunctionOn" && data.params.functionDeclaration) {
        let fn = data.params.functionDeclaration;
        fn = fn.replace( /\/\/# sourceURL=__puppeteer_evaluation_script__/, '' );
        data.params.functionDeclaration = fn;
        return JSON.stringify(data);
    }
    return message;
}

async function start() {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: chromeLocation,
        //ignoreDefaultArgs: ["--enable-automation"]
    });
        
    const proxy = new WebSocket.Server({ port: 8080 });
        

    console.log("websocket connection to", browser.wsEndpoint());
    const ws = new WebSocket(browser.wsEndpoint());
    let client = null;

    let buffer1 = [];
    let buffer2 = [];
    let open = false;

    ws.on("open", async () => {
        open = true;
        console.log("connection to browser open");
        buffer2.forEach( b => ws.send(b));
    });

    
    ws.on("message", (data) => {
        console.log("browser->ws->proxy", data);
        if (client) {
            client.send(data);
        } else {
            buffer1.push(data);
        }
    });

    
    proxy.on("connection", (c) => {
        client = c;
        console.log("client connected to proxy");
        if (buffer1.length>0) {
            buffer1.forEach( b=> client.send(b) );
        }
        client.on("message", (message) => {
            console.log("proxy->client->browser", message);
            message = filter(message);
            if (open) {
                ws.send(message);
            } else {
                buffer2.push(message);
            }
        });
    });

    // need to setup everything first
    // connect has a await on a send Target.getBrowserContexts
    const proxyBrowser = await puppeteer.connect({
        browserWSEndpoint: "ws://localhost:8080",
    });
    console.log("run test");
    test(proxyBrowser);
}

start();
