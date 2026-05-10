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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const archicadClient_1 = require("./archicadClient");
const planner_1 = require("./planner");
const tools_1 = require("./tools");
function activate(context) {
    const client = new archicadClient_1.ArchicadClient(readConfig);
    context.subscriptions.push(vscode.lm.registerTool('archicad_create_house_plan', new tools_1.CreateHousePlanTool(client)));
    context.subscriptions.push(vscode.commands.registerCommand('archicadAgent.createHousePlan', async () => {
        const prompt = await vscode.window.showInputBox({
            title: 'Create Archicad House Plan',
            prompt: 'Describe the house plan to create in the active Archicad file',
            value: 'Create a proper house plan with 2 floors',
        });
        if (!prompt) {
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Creating Archicad house plan',
            cancellable: true,
        }, async (_progress, token) => {
            const params = (0, planner_1.buildHousePlanParameters)(prompt);
            const result = await client.createHousePlan(params, token);
            vscode.window.showInformationMessage((0, tools_1.formatCreatedSummary)(params, result.created, result.note));
        });
    }));
    const participant = vscode.chat.createChatParticipant('archicad-agent-bridge.archicad', async (request, _context, stream, token) => {
        const prompt = request.prompt.trim();
        if (!prompt) {
            stream.markdown('Tell me what to create or change in Archicad.');
            return { metadata: { command: 'empty' } };
        }
        if (/\b(ping|status|connected|connection)\b/i.test(prompt)) {
            stream.progress('Checking Archicad connection');
            const port = await client.ping(token);
            stream.markdown(`AgentBridge is reachable through Archicad JSON API port ${port}.`);
            return { metadata: { command: 'ping' } };
        }
        if (!/\b(house|plan|floor|storey|story|residential|villa|home)\b/i.test(prompt)) {
            stream.markdown('This prototype currently supports creating starter residential house plans. Try: "create a 2 floor house plan 12 x 9m".');
            return { metadata: { command: 'unsupported' } };
        }
        const params = (0, planner_1.buildHousePlanParameters)(prompt);
        stream.progress(`Creating ${params.floors}-floor Archicad model`);
        const result = await client.createHousePlan(params, token);
        if (!result.succeeded) {
            stream.markdown(`Archicad failed: ${result.error?.message ?? 'unknown error'}`);
            return { metadata: { command: 'createHousePlanFailed' } };
        }
        stream.markdown((0, tools_1.formatCreatedSummary)(params, result.created, result.note));
        return { metadata: { command: 'createHousePlan' } };
    });
    participant.iconPath = new vscode.ThemeIcon('home');
    context.subscriptions.push(participant);
}
function deactivate() { }
function readConfig() {
    const config = vscode.workspace.getConfiguration('archicadAgent');
    const portStart = config.get('portStart', 19723);
    const portEnd = config.get('portEnd', 19743);
    return {
        portStart: Math.min(portStart, portEnd),
        portEnd: Math.max(portStart, portEnd),
    };
}
//# sourceMappingURL=extension.js.map