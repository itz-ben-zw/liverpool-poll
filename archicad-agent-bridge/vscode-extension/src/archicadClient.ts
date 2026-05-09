import * as http from 'node:http';
import * as vscode from 'vscode';
import { HousePlanParameters } from './planner';

interface JsonEnvelope<T> {
  succeeded?: boolean;
  result?: T;
  error?: {
    code?: number;
    message?: string;
  };
}

export interface CreateHousePlanResult {
  succeeded: boolean;
  created?: {
    walls: number;
    slabs: number;
    windows: number;
    doors: number;
    zones: number;
    notes: number;
  };
  note?: string;
  error?: {
    code: number;
    message: string;
  };
}

export interface ArchicadBridgeConfig {
  portStart: number;
  portEnd: number;
}

export class ArchicadClient {
  private cachedPort: number | undefined;

  constructor(private readonly readConfig: () => ArchicadBridgeConfig) {}

  async ping(token: vscode.CancellationToken): Promise<number> {
    const port = await this.findPort(token);
    return port;
  }

  async createHousePlan(params: HousePlanParameters, token: vscode.CancellationToken): Promise<CreateHousePlanResult> {
    return this.executeAddOnCommand<CreateHousePlanResult>('CreateHousePlan', {
      width: params.width,
      depth: params.depth,
      floors: params.floors,
      storyHeight: params.storyHeight,
    }, token);
  }

  private async executeAddOnCommand<T>(commandName: string, addOnCommandParameters: Record<string, unknown>, token: vscode.CancellationToken): Promise<T> {
    const port = await this.findPort(token);
    const envelope = await this.request<JsonEnvelope<T>>(port, {
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

    return (envelope.result ?? envelope) as T;
  }

  private async findPort(token: vscode.CancellationToken): Promise<number> {
    if (this.cachedPort !== undefined) {
      try {
        await this.pingOnPort(this.cachedPort, token);
        return this.cachedPort;
      } catch {
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
      } catch {
        continue;
      }
    }

    throw new Error(`Could not find AgentBridge in Archicad on ports ${config.portStart}-${config.portEnd}. Start Archicad 28 and load the AgentBridge add-on.`);
  }

  private async pingOnPort(port: number, token: vscode.CancellationToken): Promise<void> {
    const envelope = await this.request<JsonEnvelope<unknown>>(port, {
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

  private request<T>(port: number, payload: unknown, token: vscode.CancellationToken): Promise<T> {
    const body = JSON.stringify(payload);

    return new Promise<T>((resolve, reject) => {
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
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf8');
          if (response.statusCode !== 200) {
            reject(new Error(`Archicad JSON API returned HTTP ${response.statusCode}: ${responseBody}`));
            return;
          }

          try {
            resolve(JSON.parse(responseBody) as T);
          } catch (error) {
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

function formatArchicadError(envelope: JsonEnvelope<unknown>): string {
  const code = envelope.error?.code ?? 'unknown';
  const message = envelope.error?.message ?? 'Archicad command failed';
  return `${message} (${code})`;
}
