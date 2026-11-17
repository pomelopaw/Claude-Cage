import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rpc = await readFile(new URL('../guest-clipboard-windows/BrowserRpc.cs', import.meta.url), 'utf8');
const native = await readFile(new URL('../guest-clipboard-windows/BrowserWindowCapture.cs', import.meta.url), 'utf8');

// Contract checks for the Win32 boundary, which needs an interactive guest for
// end-to-end validation. Frame polling must never raise the browser window.
test('only successful explicit activation restores native focus and rechecks the requested tab', () => {
  const block = rpc.match(/if \(route == "\/activate" && result\["error"\] is null\)\s*\{([\s\S]*?)\n            \}/)?.[1];
  assert.ok(block, 'successful /activate must restore native focus');
  assert.match(block, /frame-proof[\s\S]*AssertRequestedTab\(input, proof\)[\s\S]*BrowserWindowCapture\.Activate\(browser!, proof\)/);
  assert.match(block, /BrowserWindowCapture\.Activate[\s\S]*frame-proof[\s\S]*AssertRequestedTab\(input, current\)[\s\S]*BrowserWindowCapture\.VerifyActivation\(browser!, current\)/);
  assert.equal((rpc.match(/BrowserWindowCapture\.Activate\(/g) ?? []).length, 1);
});

test('native activation retains process ownership and rejects ambiguous or unbound popup windows', () => {
  const block = native.match(/internal static void Activate\(Process node, JsonObject proof\)([\s\S]*?)internal static void VerifyActivation/)?.[1];
  assert.ok(block);
  for (const guard of ['focusAmbiguous', 'Chrome(node)', 'pid == process.Id', 'IsWindowVisible(window)', '!IsIconic(window)',
    'Matches(window, bounds)', 'candidates.Count != 1', 'Windows.TryGetValue', 'pin.Window != target', 'Validate(new Pin'])
    assert.ok(block.includes(guard), guard);
  assert.ok(block.indexOf('Validate(new Pin') < block.indexOf('SetForegroundWindow(target)'));
});

test('activation completion requires a fresh resolved window to own the foreground', () => {
  const block = native.match(/internal static void VerifyActivation\(Process node, JsonObject proof\)([\s\S]*?)private static View Resolve/)?.[1];
  assert.ok(block);
  assert.match(block, /Resolve\(node, proof\)/);
  assert.match(block, /!IsForeground\(view\)[\s\S]*browser_focus_required/);
  assert.doesNotMatch(block, /SetForegroundWindow/);
});
