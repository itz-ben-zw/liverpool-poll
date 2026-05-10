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
exports.CreateHousePlanTool = void 0;
exports.formatCreatedSummary = formatCreatedSummary;
const vscode = __importStar(require("vscode"));
const planner_1 = require("./planner");
class CreateHousePlanTool {
    client;
    constructor(client) {
        this.client = client;
    }
    async invoke(options, token) {
        const prompt = typeof options.input.prompt === 'string' ? options.input.prompt : 'Create a house plan';
        const params = (0, planner_1.buildHousePlanParameters)(prompt, options.input);
        const result = await this.client.createHousePlan(params, token);
        if (!result.succeeded) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`Archicad failed: ${result.error?.message ?? 'unknown error'}`),
            ]);
        }
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(formatCreatedSummary(params, result.created, result.note)),
        ]);
    }
    prepareInvocation(options, _token) {
        const params = (0, planner_1.buildHousePlanParameters)(options.input.prompt ?? 'Create a house plan', options.input);
        return {
            invocationMessage: `Creating ${params.floors}-floor Archicad house plan`,
            confirmationMessages: {
                title: 'Create Archicad house plan',
                message: new vscode.MarkdownString(`Create a ${params.width}m x ${params.depth}m, ${params.floors}-floor starter BIM model in the active Archicad file.`),
            },
        };
    }
}
exports.CreateHousePlanTool = CreateHousePlanTool;
function formatCreatedSummary(params, created, note) {
    if (!created) {
        return 'Archicad command completed, but it did not return creation counts.';
    }
    return [
        `Created a ${params.width}m x ${params.depth}m, ${params.floors}-floor starter house plan in Archicad.`,
        `Elements: ${created.walls} walls, ${created.slabs} slabs, ${created.windows} windows, ${created.doors} doors, ${created.zones} zones, ${created.notes} notes.`,
        note ?? '',
    ].filter(Boolean).join('\n\n');
}
//# sourceMappingURL=tools.js.map