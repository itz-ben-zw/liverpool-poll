import * as vscode from 'vscode';
import { ArchicadClient } from './archicadClient';
import { buildHousePlanParameters, HousePlanParameters } from './planner';

export class CreateHousePlanTool implements vscode.LanguageModelTool<Partial<HousePlanParameters>> {
  constructor(private readonly client: ArchicadClient) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<Partial<HousePlanParameters>>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const prompt = typeof options.input.prompt === 'string' ? options.input.prompt : 'Create a house plan';
    const params = buildHousePlanParameters(prompt, options.input);
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

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<Partial<HousePlanParameters>>,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    const params = buildHousePlanParameters(options.input.prompt ?? 'Create a house plan', options.input);
    return {
      invocationMessage: `Creating ${params.floors}-floor Archicad house plan`,
      confirmationMessages: {
        title: 'Create Archicad house plan',
        message: new vscode.MarkdownString(`Create a ${params.width}m x ${params.depth}m, ${params.floors}-floor starter BIM model in the active Archicad file.`),
      },
    };
  }
}

export function formatCreatedSummary(
  params: HousePlanParameters,
  created: { walls: number; slabs: number; windows: number; doors: number; zones: number; notes: number } | undefined,
  note: string | undefined,
): string {
  if (!created) {
    return 'Archicad command completed, but it did not return creation counts.';
  }

  return [
    `Created a ${params.width}m x ${params.depth}m, ${params.floors}-floor starter house plan in Archicad.`,
    `Elements: ${created.walls} walls, ${created.slabs} slabs, ${created.windows} windows, ${created.doors} doors, ${created.zones} zones, ${created.notes} notes.`,
    note ?? '',
  ].filter(Boolean).join('\n\n');
}
