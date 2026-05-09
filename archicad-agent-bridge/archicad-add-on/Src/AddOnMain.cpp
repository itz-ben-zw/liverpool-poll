#include "APIEnvir.h"
#include "ACAPinc.h"

#include "ResourceIds.hpp"

#include "DG.h"
#include "ObjectState.hpp"
#include "StringConversion.hpp"

static const GSResID AddOnInfoID			= ID_ADDON_INFO;
	static const Int32 AddOnNameID			= 1;
	static const Int32 AddOnDescriptionID	= 2;

static const short AddOnMenuID				= ID_ADDON_MENU;
	static const Int32 AddOnStatusCommandID	= 1;

namespace {

constexpr const char* CommandNamespace = "AgentBridge";
constexpr const double DefaultWidth = 12.0;
constexpr const double DefaultDepth = 9.0;
constexpr const double DefaultStoryHeight = 3.0;

struct CreatedCounts {
	Int32 walls = 0;
	Int32 slabs = 0;
	Int32 windows = 0;
	Int32 doors = 0;
	Int32 zones = 0;
	Int32 notes = 0;
};

static double GetNumberParameter (const GS::ObjectState& parameters, const char* key, double fallback)
{
	double value = fallback;
	parameters.Get (key, value);
	return value;
}

static Int32 GetIntParameter (const GS::ObjectState& parameters, const char* key, Int32 fallback)
{
	Int32 value = fallback;
	parameters.Get (key, value);
	return value;
}

static double Clamp (double value, double minValue, double maxValue)
{
	if (value < minValue)
		return minValue;
	if (value > maxValue)
		return maxValue;
	return value;
}

static Int32 Clamp (Int32 value, Int32 minValue, Int32 maxValue)
{
	if (value < minValue)
		return minValue;
	if (value > maxValue)
		return maxValue;
	return value;
}

static short GetCurrentStory ()
{
	API_StoryInfo storyInfo = {};
	const GSErrCode err = ACAPI_ProjectSetting_GetStorySettings (&storyInfo);
	if (err == NoError) {
		const short currentStory = storyInfo.actStory;
		BMKillHandle (reinterpret_cast<GSHandle*> (&storyInfo.data));
		return currentStory;
	}

	return 0;
}

static GS::ObjectState ErrorResponse (GSErrCode err, const char* message)
{
	return GS::ObjectState ("succeeded", false,
							"error", GS::ObjectState ("code", err,
													  "message", message));
}

static GSErrCode CreateWall (const API_Coord& begC,
							 const API_Coord& endC,
							 double bottomOffset,
							 double height,
							 short story,
							 API_Guid* createdGuid,
							 CreatedCounts& counts)
{
	API_Element element = {};
	element.header.type = API_WallID;

	GSErrCode err = ACAPI_Element_GetDefaults (&element, nullptr);
	if (err != NoError)
		return err;

	element.header.floorInd = story;
	element.wall.begC = begC;
	element.wall.endC = endC;
	element.wall.height = height;
	element.wall.bottomOffset = bottomOffset;
	element.wall.relativeTopStory = 0;
	element.wall.isAutoOnStoryVisibility = true;

	err = ACAPI_Element_Create (&element, nullptr);
	if (err == NoError) {
		*createdGuid = element.header.guid;
		++counts.walls;
	}

	return err;
}

static GSErrCode CreateOpening (API_ElemTypeID type,
								const API_Guid& ownerWall,
								double locationOnWall,
								double width,
								double height,
								double sillHeight,
								CreatedCounts& counts)
{
	API_Element element = {};
	API_ElementMemo memo = {};
	element.header.type = type;

	GSErrCode err = ACAPI_Element_GetDefaults (&element, &memo);
	if (err != NoError) {
		ACAPI_DisposeElemMemoHdls (&memo);
		return err;
	}

	element.window.owner = ownerWall;
	element.window.objLoc = locationOnWall;
	element.window.lower = sillHeight;
	element.window.openingBase.width = width;
	element.window.openingBase.height = height;

	err = ACAPI_Element_Create (&element, &memo);
	ACAPI_DisposeElemMemoHdls (&memo);

	if (err == NoError) {
		if (type == API_WindowID)
			++counts.windows;
		else if (type == API_DoorID)
			++counts.doors;
	}

	return err;
}

static GSErrCode CreateRectSlab (double x0,
								 double y0,
								 double x1,
								 double y1,
								 double level,
								 short story,
								 CreatedCounts& counts)
{
	API_Element element = {};
	API_ElementMemo memo = {};
	element.header.type = API_SlabID;

	GSErrCode err = ACAPI_Element_GetDefaults (&element, nullptr);
	if (err != NoError)
		return err;

	element.header.floorInd = story;
	element.slab.level = level;
	element.slab.poly.nCoords = 5;
	element.slab.poly.nSubPolys = 1;
	element.slab.poly.nArcs = 0;

	memo.coords = reinterpret_cast<API_Coord**> (BMAllocateHandle ((element.slab.poly.nCoords + 1) * sizeof (API_Coord), ALLOCATE_CLEAR, 0));
	memo.pends = reinterpret_cast<Int32**> (BMAllocateHandle ((element.slab.poly.nSubPolys + 1) * sizeof (Int32), ALLOCATE_CLEAR, 0));
	if (memo.coords == nullptr || memo.pends == nullptr) {
		ACAPI_DisposeElemMemoHdls (&memo);
		return APIERR_MEMFULL;
	}

	(*memo.coords)[1] = { x0, y0 };
	(*memo.coords)[2] = { x1, y0 };
	(*memo.coords)[3] = { x1, y1 };
	(*memo.coords)[4] = { x0, y1 };
	(*memo.coords)[5] = (*memo.coords)[1];
	(*memo.pends)[0] = 0;
	(*memo.pends)[1] = 5;

	err = ACAPI_Element_Create (&element, &memo);
	ACAPI_DisposeElemMemoHdls (&memo);

	if (err == NoError)
		++counts.slabs;

	return err;
}

static GSErrCode CreateRectZone (double x0,
								 double y0,
								 double x1,
								 double y1,
								 double baseLevel,
								 double height,
								 short story,
								 const GS::UniString& name,
								 const GS::UniString& number,
								 CreatedCounts& counts)
{
	API_Element element = {};
	API_ElementMemo memo = {};
	element.header.type = API_ZoneID;

	GSErrCode err = ACAPI_Element_GetDefaults (&element, &memo);
	if (err != NoError) {
		ACAPI_DisposeElemMemoHdls (&memo);
		return err;
	}

	element.header.floorInd = story;
	element.zone.manual = true;
	element.zone.roomBaseLev = baseLevel;
	element.zone.roomHeight = height;
	element.zone.poly.nCoords = 5;
	element.zone.poly.nSubPolys = 1;
	element.zone.poly.nArcs = 0;
	element.zone.pos = { (x0 + x1) / 2.0, (y0 + y1) / 2.0 };

	GS::snuprintf (element.zone.roomName, sizeof (element.zone.roomName), name.ToUStr ());
	GS::snuprintf (element.zone.roomNoStr, sizeof (element.zone.roomNoStr), number.ToUStr ());

	memo.coords = reinterpret_cast<API_Coord**> (BMAllocateHandle ((element.zone.poly.nCoords + 1) * sizeof (API_Coord), ALLOCATE_CLEAR, 0));
	memo.pends = reinterpret_cast<Int32**> (BMAllocateHandle ((element.zone.poly.nSubPolys + 1) * sizeof (Int32), ALLOCATE_CLEAR, 0));
	if (memo.coords == nullptr || memo.pends == nullptr) {
		ACAPI_DisposeElemMemoHdls (&memo);
		return APIERR_MEMFULL;
	}

	(*memo.coords)[1] = { x0, y0 };
	(*memo.coords)[2] = { x1, y0 };
	(*memo.coords)[3] = { x1, y1 };
	(*memo.coords)[4] = { x0, y1 };
	(*memo.coords)[5] = (*memo.coords)[1];
	(*memo.pends)[0] = 0;
	(*memo.pends)[1] = 5;

	err = ACAPI_Element_Create (&element, &memo);
	ACAPI_DisposeElemMemoHdls (&memo);

	if (err == NoError)
		++counts.zones;

	return err;
}

static GSErrCode CreateNote (const API_Coord& position,
							 short story,
							 const GS::UniString& content,
							 CreatedCounts& counts)
{
	API_Element element = {};
	API_ElementMemo memo = {};
	element.header.type = API_TextID;

	GSErrCode err = ACAPI_Element_GetDefaults (&element, nullptr);
	if (err != NoError)
		return err;

	element.header.floorInd = story;
	element.text.loc = position;
	element.text.anchor = APIAnc_LT;
	element.text.just = APIJust_Left;
	element.text.size = 2.5;
	element.text.width = 80.0;
	element.text.nonBreaking = true;
	element.text.nLine = 1;

	memo.textContent = new GS::UniString { content };

	err = ACAPI_Element_Create (&element, &memo);
	ACAPI_DisposeElemMemoHdls (&memo);

	if (err == NoError)
		++counts.notes;

	return err;
}

static GSErrCode CreateHouseGeometry (double width,
									  double depth,
									  Int32 floors,
									  double storyHeight,
									  CreatedCounts& counts)
{
	const short baseStory = GetCurrentStory ();

	for (Int32 floor = 0; floor < floors; ++floor) {
		const double z = floor * storyHeight;
		GS::Array<API_Guid> wallGuids;
		wallGuids.SetSize (4);

		GSErrCode err = CreateRectSlab (0.0, 0.0, width, depth, z, baseStory, counts);
		if (err != NoError)
			return err;

		err = CreateWall ({ 0.0, 0.0 }, { width, 0.0 }, z, storyHeight, baseStory, &wallGuids[0], counts);
		if (err != NoError)
			return err;
		err = CreateWall ({ width, 0.0 }, { width, depth }, z, storyHeight, baseStory, &wallGuids[1], counts);
		if (err != NoError)
			return err;
		err = CreateWall ({ width, depth }, { 0.0, depth }, z, storyHeight, baseStory, &wallGuids[2], counts);
		if (err != NoError)
			return err;
		err = CreateWall ({ 0.0, depth }, { 0.0, 0.0 }, z, storyHeight, baseStory, &wallGuids[3], counts);
		if (err != NoError)
			return err;

		API_Guid partitionGuid = APINULLGuid;
		err = CreateWall ({ width * 0.5, 0.0 }, { width * 0.5, depth * 0.58 }, z, storyHeight, baseStory, &partitionGuid, counts);
		if (err != NoError)
			return err;
		err = CreateWall ({ 0.0, depth * 0.58 }, { width, depth * 0.58 }, z, storyHeight, baseStory, &partitionGuid, counts);
		if (err != NoError)
			return err;

		if (floor == 0) {
			err = CreateOpening (API_DoorID, wallGuids[0], width * 0.5, 1.10, 2.10, 0.0, counts);
			if (err != NoError)
				return err;
		}

		err = CreateOpening (API_WindowID, wallGuids[0], width * 0.25, 1.20, 1.20, 0.90, counts);
		if (err != NoError)
			return err;
		err = CreateOpening (API_WindowID, wallGuids[0], width * 0.75, 1.20, 1.20, 0.90, counts);
		if (err != NoError)
			return err;
		err = CreateOpening (API_WindowID, wallGuids[1], depth * 0.45, 1.20, 1.20, 0.90, counts);
		if (err != NoError)
			return err;
		err = CreateOpening (API_WindowID, wallGuids[2], width * 0.35, 1.20, 1.20, 0.90, counts);
		if (err != NoError)
			return err;
		err = CreateOpening (API_WindowID, wallGuids[3], depth * 0.55, 1.20, 1.20, 0.90, counts);
		if (err != NoError)
			return err;

		const GS::UniString roomPrefix = floor == 0 ? "Ground" : "Upper";
		err = CreateRectZone (0.30, 0.30, width * 0.50 - 0.15, depth * 0.58 - 0.15, z, storyHeight, baseStory, roomPrefix + " Living", GS::UniString::SPrintf ("%d01", floor + 1), counts);
		if (err != NoError)
			return err;
		err = CreateRectZone (width * 0.50 + 0.15, 0.30, width - 0.30, depth * 0.58 - 0.15, z, storyHeight, baseStory, floor == 0 ? "Kitchen / Dining" : "Bedroom 1", GS::UniString::SPrintf ("%d02", floor + 1), counts);
		if (err != NoError)
			return err;
		err = CreateRectZone (0.30, depth * 0.58 + 0.15, width * 0.50 - 0.15, depth - 0.30, z, storyHeight, baseStory, floor == 0 ? "Guest Room" : "Bedroom 2", GS::UniString::SPrintf ("%d03", floor + 1), counts);
		if (err != NoError)
			return err;
		err = CreateRectZone (width * 0.50 + 0.15, depth * 0.58 + 0.15, width - 0.30, depth - 0.30, z, storyHeight, baseStory, floor == 0 ? "Stair / WC" : "Bath / Landing", GS::UniString::SPrintf ("%d04", floor + 1), counts);
		if (err != NoError)
			return err;

		err = CreateNote ({ width + 1.0, depth - floor * 1.0 }, baseStory,
						  GS::UniString::SPrintf ("AgentBridge floor %d: walls, slab, openings, zones", floor + 1),
						  counts);
		if (err != NoError)
			return err;
	}

	const double roofLevel = floors * storyHeight;
	return CreateRectSlab (-0.30, -0.30, width + 0.30, depth + 0.30, roofLevel, baseStory, counts);
}

class PingCommand : public API_AddOnCommand {
public:
	virtual GS::String GetName () const override
	{
		return "Ping";
	}

	virtual GS::String GetNamespace () const override
	{
		return CommandNamespace;
	}

	virtual GS::Optional<GS::UniString> GetSchemaDefinitions () const override
	{
		return GS::NoValue;
	}

	virtual GS::Optional<GS::UniString> GetInputParametersSchema () const override
	{
		return GS::NoValue;
	}

	virtual GS::Optional<GS::UniString> GetResponseSchema () const override
	{
		return R"(
			{
				"type": "object",
				"properties": {
					"succeeded": { "type": "boolean" },
					"namespace": { "type": "string" },
					"version": { "type": "string" }
				},
				"additionalProperties": false,
				"required": [ "succeeded", "namespace", "version" ]
			}
		)";
	}

	virtual API_AddOnCommandExecutionPolicy GetExecutionPolicy () const override
	{
		return API_AddOnCommandExecutionPolicy::InstantExecutionOnParallelThread;
	}

	virtual bool IsProcessWindowVisible () const override
	{
		return false;
	}

	virtual GS::ObjectState Execute (const GS::ObjectState&, GS::ProcessControl&) const override
	{
		return GS::ObjectState ("succeeded", true,
								"namespace", CommandNamespace,
								"version", ADDON_VERSION);
	}

	virtual void OnResponseValidationFailed (const GS::ObjectState&) const override
	{
	}
};

class CreateHousePlanCommand : public API_AddOnCommand {
public:
	virtual GS::String GetName () const override
	{
		return "CreateHousePlan";
	}

	virtual GS::String GetNamespace () const override
	{
		return CommandNamespace;
	}

	virtual GS::Optional<GS::UniString> GetSchemaDefinitions () const override
	{
		return GS::NoValue;
	}

	virtual GS::Optional<GS::UniString> GetInputParametersSchema () const override
	{
		return R"(
			{
				"type": "object",
				"properties": {
					"width": {
						"type": "number",
						"description": "Overall building width in meters."
					},
					"depth": {
						"type": "number",
						"description": "Overall building depth in meters."
					},
					"floors": {
						"type": "integer",
						"description": "Number of floors, clamped to 1-4."
					},
					"storyHeight": {
						"type": "number",
						"description": "Floor-to-floor height in meters."
					}
				},
				"additionalProperties": false
			}
		)";
	}

	virtual GS::Optional<GS::UniString> GetResponseSchema () const override
	{
		return R"(
			{
				"type": "object",
				"oneOf": [
					{
						"properties": {
							"succeeded": { "type": "boolean" },
							"created": {
								"type": "object",
								"properties": {
									"walls": { "type": "integer" },
									"slabs": { "type": "integer" },
									"windows": { "type": "integer" },
									"doors": { "type": "integer" },
									"zones": { "type": "integer" },
									"notes": { "type": "integer" }
								},
								"additionalProperties": false,
								"required": [ "walls", "slabs", "windows", "doors", "zones", "notes" ]
							},
							"note": { "type": "string" }
						},
						"additionalProperties": false,
						"required": [ "succeeded", "created", "note" ]
					},
					{
						"properties": {
							"succeeded": { "type": "boolean" },
							"error": {
								"type": "object",
								"properties": {
									"code": { "type": "integer" },
									"message": { "type": "string" }
								},
								"additionalProperties": false,
								"required": [ "code", "message" ]
							}
						},
						"additionalProperties": false,
						"required": [ "succeeded", "error" ]
					}
				]
			}
		)";
	}

	virtual API_AddOnCommandExecutionPolicy GetExecutionPolicy () const override
	{
		return API_AddOnCommandExecutionPolicy::ScheduleForExecutionOnMainThread;
	}

	virtual bool IsProcessWindowVisible () const override
	{
		return true;
	}

	virtual GS::ObjectState Execute (const GS::ObjectState& parameters, GS::ProcessControl&) const override
	{
		const double width = Clamp (GetNumberParameter (parameters, "width", DefaultWidth), 5.0, 60.0);
		const double depth = Clamp (GetNumberParameter (parameters, "depth", DefaultDepth), 5.0, 60.0);
		const Int32 floors = Clamp (GetIntParameter (parameters, "floors", 2), 1, 4);
		const double storyHeight = Clamp (GetNumberParameter (parameters, "storyHeight", DefaultStoryHeight), 2.4, 5.0);

		CreatedCounts counts;
		const GSErrCode err = ACAPI_CallUndoableCommand ("AgentBridge Create House Plan", [&] () -> GSErrCode {
			return CreateHouseGeometry (width, depth, floors, storyHeight, counts);
		});

		if (err != NoError)
			return ErrorResponse (err, "Failed to create the requested house plan.");

		GS::ObjectState created;
		created.Add ("walls", counts.walls);
		created.Add ("slabs", counts.slabs);
		created.Add ("windows", counts.windows);
		created.Add ("doors", counts.doors);
		created.Add ("zones", counts.zones);
		created.Add ("notes", counts.notes);

		return GS::ObjectState ("succeeded", true,
								"created", created,
								"note", "Created a parametric starter BIM model. Schedules, layout sheets, true section/elevation viewpoints, and code-compliant construction documents are the next command handlers to add.");
	}

	virtual void OnResponseValidationFailed (const GS::ObjectState&) const override
	{
	}
};

static GSErrCode MenuCommandHandler (const API_MenuParams* menuParams)
{
	if (menuParams->menuItemRef.menuResID == AddOnMenuID &&
		menuParams->menuItemRef.itemIndex == AddOnStatusCommandID)
	{
		DG::InformationAlert ("AgentBridge is loaded",
							  "Use the VS Code extension or Archicad JSON command API namespace AgentBridge.",
							  "OK");
	}

	return NoError;
}

}

API_AddonType CheckEnvironment (API_EnvirParams* envir)
{
	RSGetIndString (&envir->addOnInfo.name, AddOnInfoID, AddOnNameID, ACAPI_GetOwnResModule ());
	RSGetIndString (&envir->addOnInfo.description, AddOnInfoID, AddOnDescriptionID, ACAPI_GetOwnResModule ());

	return APIAddon_Preload;
}

GSErrCode RegisterInterface (void)
{
	return ACAPI_MenuItem_RegisterMenu (AddOnMenuID, 0, MenuCode_Tools, MenuFlag_Default);
}

GSErrCode Initialize (void)
{
	GSErrCode err = ACAPI_MenuItem_InstallMenuHandler (AddOnMenuID, MenuCommandHandler);
	if (err != NoError)
		return err;

	err = ACAPI_AddOnAddOnCommunication_InstallAddOnCommandHandler (GS::NewOwned<PingCommand> ());
	if (err != NoError)
		return err;

	return ACAPI_AddOnAddOnCommunication_InstallAddOnCommandHandler (GS::NewOwned<CreateHousePlanCommand> ());
}

GSErrCode FreeData (void)
{
	return NoError;
}
