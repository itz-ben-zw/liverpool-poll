"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchicadClient = void 0;
const http = __importStar(require("node:http"));
const vscode = __importStar(require("vscode"));
class ArchicadClient {
    readConfig;
    cachedPort;
    constructor(readConfig) {
        this.readConfig = readConfig;
    }
    async ping(token) {
        const port = await this.findPort(token);
        return port;
    }
    async createHousePlan(params, token) {
        return this.executeAddOnCommand('CreateHousePlan', {
            width: params.width,
            depth: params.depth,
            floors: params.floors,
            storyHeight: params.storyHeight,
        }, token);
    }
    async executeAddOnCommand(commandName, addOnCommandParameters, token) {
        const port = await this.findPort(token);
        const envelope = await this.request(port, {
            command: 'API.ExecuteAddOnCommand',
            parameters: {
                addOnCommandId: {
                    commandNamespace: 'AgentBridge',
                    commandName,
                },
                addOnCommandParameters,
            },
        }, token);
        if (envelope.succeeded === false) {
            throw new Error(formatArchicadError(envelope));
        }
        return (envelope.result ?? envelope);
    }
    async findPort(token) {
        if (this.cachedPort !== undefined) {
            try {
                await this.pingOnPort(this.cachedPort, token);
                return this.cachedPort;
            }
            catch {
                this.cachedPort = undefined;
            }
        }
        const config = this.readConfig();
        for (let port = config.portStart; port <= config.portEnd; port += 1) {
            if (token.isCancellationRequested) {
                throw new vscode.CancellationError();
            }
            try {
                await this.pingOnPort(port, token);
                this.cachedPort = port;
                return port;
            }
            catch {
                continue;
            }
        }
        throw new Error(`Could not find AgentBridge in Archicad on ports ${config.portStart}-${config.portEnd}. Start Archicad 28 and load the AgentBridge add-on.`);
    }
    async pingOnPort(port, token) {
        const envelope = await this.request(port, {
            command: 'API.ExecuteAddOnCommand',
            parameters: {
                addOnCommandId: {
                    commandNamespace: 'AgentBridge',
                    commandName: 'Ping',
                },
                addOnCommandParameters: {},
            },
        }, token);
        if (envelope.succeeded === false) {
            throw new Error(formatArchicadError(envelope));
        }
    }
    request(port, payload, token) {
        const body = JSON.stringify(payload);
        return new Promise((resolve, reject) => {
            const request = http.request({
                hostname: '127.0.0.1',
                port,
                path: '/',
                method: 'GET',
                headers: {
                    Accept: '*/*',
                    'Content-Type': 'application/json;charset=utf-8',
                    'Content-Length': Buffer.byteLength(body),
                },
            }, response => {
                const chunks = [];
                response.on('data', chunk => chunks.push(Buffer.from(chunk)));
                response.on('end', () => {
                    const responseBody = Buffer.concat(chunks).toString('utf8');
                    if (response.statusCode !== 200) {
                        reject(new Error(`Archicad JSON API returned HTTP ${response.statusCode}: ${responseBody}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(responseBody));
                    }
                    catch (error) {
                        reject(new Error(`Archicad returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
                    }
                });
            });
            const cancellation = token.onCancellationRequested(() => {
                request.destroy(new vscode.CancellationError());
            });
            request.on('error', error => {
                cancellation.dispose();
                reject(error);
            });
            request.on('close', () => cancellation.dispose());
            request.write(body);
            request.end();
        });
    }
}
exports.ArchicadClient = ArchicadClient;
function formatArchicadError(envelope) {
    const code = envelope.error?.code ?? 'unknown';
    const message = envelope.error?.message ?? 'Archicad command failed';
    return `${message} (${code})`;
}
//# sourceMappingURL=archicadClient.js.map