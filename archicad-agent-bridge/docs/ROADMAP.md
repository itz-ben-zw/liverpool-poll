# AgentBridge Command Roadmap

The bridge is intentionally command-based. Each serious BIM operation should become a validated add-on command instead of one unrestricted "do anything" endpoint.

Recommended next handlers:

- `CreateSectionElevationSet`: create true section and elevation viewpoints around the generated building.
- `CreateSchedules`: create or update element schedules for zones, doors, windows, walls, and finishes.
- `ApplyOfficeTemplate`: map generated elements to office layers, composites, surfaces, favorites, pens, and renovation status.
- `CreateDimensionsAndLabels`: add dimensions, room labels, door/window labels, and keynotes.
- `CreateLayouts`: place views and schedules onto sheets using master layouts.
- `ReviseHousePlan`: accept selected element GUIDs and safely modify an existing generated plan.
- `ValidateModel`: run checks for missing zones, unhosted openings, bad dimensions, and minimum room sizes.

The VS Code side can stay stable while these handlers are added. The agent should call narrow tools with explicit schemas and confirmations.
