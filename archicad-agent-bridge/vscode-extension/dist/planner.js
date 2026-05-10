"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHousePlanParameters = buildHousePlanParameters;
const numberWords = new Map([
    ['one', 1],
    ['two', 2],
    ['three', 3],
    ['four', 4],
]);
function buildHousePlanParameters(prompt, overrides = {}) {
    const normalizedPrompt = prompt.trim();
    const dimensions = parseDimensions(normalizedPrompt);
    return {
        prompt: normalizedPrompt,
        width: clampNumber(overrides.width ?? dimensions?.width ?? inferWidth(normalizedPrompt), 5, 60),
        depth: clampNumber(overrides.depth ?? dimensions?.depth ?? inferDepth(normalizedPrompt), 5, 60),
        floors: clampInteger(overrides.floors ?? parseFloors(normalizedPrompt) ?? 2, 1, 4),
        storyHeight: clampNumber(overrides.storyHeight ?? parseStoryHeight(normalizedPrompt) ?? 3, 2.4, 5),
    };
}
function parseDimensions(prompt) {
    const match = prompt.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?/i);
    if (!match) {
        return undefined;
    }
    return {
        width: Number(match[1]),
        depth: Number(match[2]),
    };
}
function parseFloors(prompt) {
    const digitMatch = prompt.match(/(\d+)\s*(?:floor|floors|storey|storeys|story|stories|level|levels)/i);
    if (digitMatch) {
        return Number(digitMatch[1]);
    }
    const wordMatch = prompt.match(/\b(one|two|three|four)\s*(?:floor|floors|storey|storeys|story|stories|level|levels)\b/i);
    if (wordMatch) {
        return numberWords.get(wordMatch[1].toLowerCase());
    }
    return undefined;
}
function parseStoryHeight(prompt) {
    const match = prompt.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?\s*(?:story height|floor height|floor-to-floor)/i);
    return match ? Number(match[1]) : undefined;
}
function inferWidth(prompt) {
    if (/\b(tiny|compact|small)\b/i.test(prompt)) {
        return 8;
    }
    if (/\b(large|spacious|villa|mansion)\b/i.test(prompt)) {
        return 18;
    }
    return 12;
}
function inferDepth(prompt) {
    if (/\b(tiny|compact|small)\b/i.test(prompt)) {
        return 7;
    }
    if (/\b(large|spacious|villa|mansion)\b/i.test(prompt)) {
        return 14;
    }
    return 9;
}
function clampNumber(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}
function clampInteger(value, min, max) {
    return Math.round(clampNumber(value, min, max));
}
//# sourceMappingURL=planner.js.map