import * as vscode from 'vscode';
import { ArchicadClient } from './archicadClient';
import { buildHousePlanParameters } from './planner';
import { CreateHousePlanTool, formatCreatedSummary } from './tools';

interface ArchicadChatResult extends vscode.ChatResult {
  metadata: {
    command: string;
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const client = new ArchicadClient(readConfig);

  context.subscriptions.push(
    vscode.lm.registerTool('archicad_create_house_plan', new CreateHousePlanTool(client)),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('archicadAgent.createHousePlan', async () => {
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
        const params = buildHousePlanParameters(prompt);
        const result = await client.createHousePlan(params, token);
        vscode.window.showInformationMessage(formatCreatedSummary(params, result.created, result.note));
      });
    }),
  );

  const participant = vscode.chat.createChatParticipant('archicad-agent-bridge.archicad', async (request, _context, stream, token): Promise<ArchicadChatResult> => {
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

    const params = buildHousePlanParameters(prompt);
    stream.progress(`Creating ${params.floors}-floor Archicad model`);
    const result = await client.createHousePlan(params, token);

    if (!result.succeeded) {
      stream.markdown(`Archicad failed: ${result.error?.message ?? 'unknown error'}`);
      return { metadata: { command: 'createHousePlanFailed' } };
    }

    stream.markdown(formatCreatedSummary(params, result.created, result.note));
    return { metadata: { command: 'createHousePlan' } };
  });

  participant.iconPath = new vscode.ThemeIcon('home');
  context.subscriptions.push(participant);
}

export function deactivate(): void {}

function readConfig() {
  const config = vscode.workspace.getConfiguration('archicadAgent');
  const portStart = config.get<number>('portStart', 19723);
  const portEnd = config.get<number>('portEnd', 19743);
  return {
    portStart: Math.min(portStart, portEnd),
    portEnd: Math.max(portStart, portEnd),
  };
}
