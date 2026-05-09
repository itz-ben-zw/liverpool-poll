# Archicad Agent Bridge

This is a practical starter bridge between VS Code agent chat and Archicad 28.

It has two pieces:

- `archicad-add-on`: a C++ Archicad add-on based on Graphisoft's CMake template.
- `vscode-extension`: a VS Code chat participant and language model tool that calls Archicad through the local JSON Interface.

## Current Capability

The add-on registers these JSON commands:

- `AgentBridge.Ping`: verifies the add-on is loaded.
- `AgentBridge.CreateHousePlan`: creates a parametric starter residential BIM model in the active Archicad file.

`CreateHousePlan` currently creates:

- exterior walls and basic internal partitions
- floor slabs and a roof slab
- a main entry door
- windows on the outer walls
- manual zones for rooms
- text notes summarizing generated floors

This is not yet a complete architectural production-document generator. True section/elevation viewpoints, layout sheets, interactive schedules, detailed dimensions, code checks, library-object selection, and office-standard annotation should be added as separate command handlers.

## Build The Archicad Add-On

Prerequisites:

- Archicad 28
- Archicad API DevKit 28
- Visual Studio with the v142 toolset
- CMake 3.19+
- Python 3.10+

The official Archicad 28 DevKit was downloaded here for reference:

```powershell
archicad-agent-bridge\devkit-28\Support
```

Build:

```powershell
cd archicad-agent-bridge\archicad-add-on
cmake -B Build -G "Visual Studio 17 2022" -A x64 -T v142 -DAC_API_DEVKIT_DIR="..\devkit-28\Support" -DAC_VERSION=28
cmake --build Build --config Release
```

Load the generated `.apx` in Archicad:

1. Open Archicad 28.
2. Go to `Options > Add-On Manager`.
3. Add the generated `.apx` from the build output.
4. Confirm `Options > AgentBridge Status...` appears.

## Run The VS Code Extension

```powershell
cd archicad-agent-bridge\vscode-extension
npm install
npm run compile
code .
```

Press `F5` in VS Code to open an Extension Development Host. In the chat view, use:

```text
@archicad create a proper house plan with 2 floors
```

You can also reference the tool in agent mode as `#createHousePlan`.

## Direct JSON Test

After the add-on is built and loaded in Archicad, test without VS Code:

```powershell
.\archicad-agent-bridge\scripts\create-house-plan.ps1 -Width 12 -Depth 9 -Floors 2
```

## How It Works

VS Code sends an `API.ExecuteAddOnCommand` request to Archicad's local JSON API. Archicad routes that request to the loaded C++ add-on command handler:

```json
{
  "command": "API.ExecuteAddOnCommand",
  "parameters": {
    "addOnCommandId": {
      "commandNamespace": "AgentBridge",
      "commandName": "CreateHousePlan"
    },
    "addOnCommandParameters": {
      "width": 12,
      "depth": 9,
      "floors": 2,
      "storyHeight": 3
    }
  }
}
```

## Sources

- Graphisoft C++ add-on getting started: https://graphisoft.github.io/archicad-api-devkit/
- Graphisoft `API_AddOnCommand`: https://graphisoft.github.io/archicad-api-devkit/class_a_p_i___add_on_command.html
- Graphisoft add-on command handler: https://graphisoft.github.io/archicad-api-devkit/group___add_on_add_on_communication.html
- Graphisoft JSON/Python connection overview: https://gsdownloads.graphisoft.com/cdn/Python/ARCHICAD-Python_Connection_Getting_Started.pdf
- VS Code Chat Participant API: https://code.visualstudio.com/api/extension-guides/ai/chat
- VS Code Language Model Tool API: https://code.visualstudio.com/api/extension-guides/ai/tools
