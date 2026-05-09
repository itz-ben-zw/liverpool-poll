param(
    [double] $Width = 12.0,
    [double] $Depth = 9.0,
    [int] $Floors = 2,
    [double] $StoryHeight = 3.0,
    [int] $PortStart = 19723,
    [int] $PortEnd = 19743
)

$payload = @{
    command = "API.ExecuteAddOnCommand"
    parameters = @{
        addOnCommandId = @{
            commandNamespace = "AgentBridge"
            commandName = "CreateHousePlan"
        }
        addOnCommandParameters = @{
            width = $Width
            depth = $Depth
            floors = $Floors
            storyHeight = $StoryHeight
        }
    }
} | ConvertTo-Json -Depth 10

foreach ($port in $PortStart..$PortEnd) {
    try {
        $result = Invoke-RestMethod -Uri "http://127.0.0.1:$port/" -Method Get -ContentType "application/json;charset=utf-8" -Body $payload -TimeoutSec 5
        if ($result.succeeded -eq $true) {
            $result | ConvertTo-Json -Depth 10
            exit 0
        }
    } catch {
    }
}

Write-Error "AgentBridge was not reachable on ports $PortStart-$PortEnd. Start Archicad 28 and load the compiled add-on."
exit 1
